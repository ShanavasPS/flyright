/** Client for GET /api/flight-status. Relative fetch resolves against the dev
 * server in development and the expo-router `origin` in production builds.
 *
 * Live lookups are metered per account (the route proxies a paid provider),
 * so every request carries the Clerk session token when there is one. Signed
 * out, the route answers 401 and the screens offer sign-in instead; over the
 * daily budget it answers 429 and the trip is saved as a journal row. */

import { getClerkInstance } from '@clerk/expo';
import { Platform } from 'react-native';

export interface FlightStatus {
  flight: string;
  date: string;
  status: string;
  /** True once the flight has actually landed — the only state where
   * delayMinutes is a final arrival delay rather than a live prediction.
   * Optional: responses served before the API route learned it lack it. */
  landed?: boolean;
  delayMinutes: number | null;
  distanceKm: number | null;
  carrier: { name: string; iata: string };
  carrierCountry: string;
  from: { code: string | null; country: string | null };
  to: { code: string | null; country: string | null };
  scheduledDeparture: string | null;
  scheduledArrival: string | null;
  /** Travel-day facts — absent from responses served before the API route
   * learned them, so every field is optional as well as nullable. */
  gate?: string | null;
  terminal?: string | null;
  checkInDesk?: string | null;
  baggageBelt?: string | null;
  boardingTime?: string | null;
  estimatedDeparture?: string | null;
  actualDeparture?: string | null;
  estimatedArrival?: string | null;
  actualArrival?: string | null;
  /** The operating airframe, when the provider knows it. */
  aircraft?: { reg: string; model: string | null } | null;
  /** The aircraft's previous rotation leg — only present when the lookup
   * asked for it (`inbound: true`) and the flight hasn't departed yet. */
  inbound?: InboundLeg | null;
}

export interface InboundLeg {
  flight: string | null;
  from: { code: string | null };
  status: string;
  landed: boolean;
  scheduledArrival: string | null;
  estimatedArrival: string | null;
  actualArrival: string | null;
}

export class FlightLookupError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'FlightLookupError';
  }

  /** The caller must sign in before live lookups work. */
  get signInRequired(): boolean {
    return this.status === 401;
  }

  /** Today's live-lookup budget is spent. Resets at midnight UTC. */
  get quotaExceeded(): boolean {
    return this.status === 429;
  }

  /** Our own monthly provider budget is spent, not the caller's — nothing
   * they do makes live data come back today, so screens offer the manual
   * path rather than a retry. */
  get liveDataPaused(): boolean {
    return this.status === 503;
  }
}

/** The signed-in session's token for the Authorization header, or null when
 * signed out (or on web before Clerk has loaded). */
async function sessionToken(): Promise<string | null> {
  try {
    return (await getClerkInstance().session?.getToken()) ?? null;
  } catch {
    return null;
  }
}


/** IATA flight designator: 2-char airline code + 1–4 digits (+ optional suffix). */
const FLIGHT_NUMBER = /^([A-Z]{2}|[A-Z]\d|\d[A-Z])\d{1,4}[A-Z]?$/;

export function normalizeFlightNumber(input: string): string | null {
  const compact = input.toUpperCase().replace(/\s/g, '');
  return FLIGHT_NUMBER.test(compact) ? compact : null;
}

export async function lookupFlight(
  flight: string,
  date: string,
  options?: { inbound?: boolean },
): Promise<FlightStatus> {
  const inbound = options?.inbound ? '&inbound=1' : '';
  const token = await sessionToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (Platform.OS === 'web') {
    // The public compensation checker on our own site is the one anonymous
    // caller the route allows, budgeted per address. Browsers omit `Origin`
    // on same-origin GETs (and a referrer policy can drop `Referer`), so the
    // web client says so explicitly. This is not a secret — the daily
    // per-address budget, not the header, is what limits abuse.
    headers['X-FlyRight-Web'] = '1';
  }
  const response = await fetch(
    `/api/flight-status?flight=${encodeURIComponent(flight)}&date=${encodeURIComponent(date)}${inbound}`,
    Object.keys(headers).length ? { headers } : undefined,
  );

  if (!response.ok) {
    const message =
      response.status === 404
        ? 'No flight found for that number and day.'
        : response.status === 401
          ? 'Sign in to look flights up live.'
          : response.status === 429
            ? "Today's live lookups are used up — try again tomorrow."
            : response.status === 503
              ? 'Live flight data is paused right now — you can add this flight by hand.'
              : response.status === 501
                ? 'Flight lookup is not configured yet.'
                : 'Flight lookup failed — try again.';
    throw new FlightLookupError(message, response.status);
  }

  return response.json();
}
