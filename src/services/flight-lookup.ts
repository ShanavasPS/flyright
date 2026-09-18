/** Client for GET /api/flight-status. Relative fetch resolves against the dev
 * server in development and the expo-router `origin` in production builds.
 *
 * Live lookups are metered per account (the route proxies a paid provider),
 * so every request carries the Clerk session token when there is one. Guests
 * get five fresh lookups per UTC day, metered server-side per network address.
 * A spent guest allowance offers sign-in; paid-provider outages still allow
 * saving a trip as a journal row. */

import { getClerkInstance } from '@clerk/expo';
import { Platform } from 'react-native';
import { LOOKUP_GAP_MS, createSerialQueue } from '@/services/lookup-queue';

/** Mirrors convex/flightNormalize's FlightPosition. */
export interface FlightPosition {
  latitude: number;
  longitude: number;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  /** True track, degrees clockwise from north. */
  trackDeg: number | null;
  /** ISO instant the position was reported. */
  reportedAt: string;
}

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
  /** When the provider last revised this record — absent from responses
   * served before the API route learned it. See services/schedule-change. */
  scheduleUpdatedAt?: string | null;
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
  /** The aircraft's last reported position while in the air (null on the
   * ground or out of receiver coverage); absent from older responses. */
  position?: FlightPosition | null;
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
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'FlightLookupError';
  }

  /** An expired session or a spent guest allowance needs sign-in. */
  get signInRequired(): boolean {
    return this.status === 401 || this.code === 'guest_quota_exceeded';
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

/** Who is asking, for every metered route: the session token when signed
 * in, else the guest marker. The markers survive EAS Hosting's forwarded
 * Origin/Referer; they identify the guest flow, and the server's
 * per-address meter limits it. */
export async function lookupHeaders(): Promise<Record<string, string>> {
  const token = await sessionToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return { [Platform.OS === 'web' ? 'X-FlyRight-Web' : 'X-FlyRight-Guest']: '1' };
}

const lookupQueue = createSerialQueue(LOOKUP_GAP_MS);

export async function lookupFlight(
  flight: string,
  date: string,
  options?: { inbound?: boolean; background?: boolean },
): Promise<FlightStatus> {
  const inbound = options?.inbound ? '&inbound=1' : '';
  const headers = await lookupHeaders();
  // The guest allowance is for searches the traveller initiates. A headless
  // refresh must not spend it before they next open the app.
  if (options?.background && !headers.Authorization) {
    throw new FlightLookupError('Sign in for background flight updates.', 401);
  }
  // Through the queue: one provider call at a time, a breath apart, whoever
  // asked — the import's legs, the flight watch, add-flight.
  const response = await lookupQueue(() =>
    fetch(
      `/api/flight-status?flight=${encodeURIComponent(flight)}&date=${encodeURIComponent(date)}${inbound}`,
      Object.keys(headers).length ? { headers } : undefined,
    ),
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const code = typeof body?.error === 'string' ? body.error : undefined;
    const message =
      code === 'guest_quota_exceeded'
        ? "You've used today's 5 guest lookups. Sign in to look up more flights."
        : response.status === 404
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
    throw new FlightLookupError(message, response.status, code);
  }

  return response.json();
}
