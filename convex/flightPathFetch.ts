/** The one place that speaks HTTP to the flight-path provider (FlightAware
 * AeroAPI). Shared by the hosting route and the Convex action that makes
 * the call on its behalf, the same split as providerFetch.ts.
 *
 * Configuration, all optional — with no key the app draws the great circle
 * it always has:
 *
 *   FLIGHTAWARE_API_KEY        the AeroAPI key (x-apikey)
 *   FLIGHTAWARE_BASE_URL       default https://aeroapi.flightaware.com/aeroapi
 *   FLIGHTAWARE_MONTHLY_CENTS  the month's spending cap, default 10000
 *                              (the Standard tier's $100 minimum)
 *   FLIGHTAWARE_HISTORY        '1' to fetch flights older than ten days
 *                              through the history endpoints (Standard
 *                              tier only, and 5× the price per track)
 */

declare const process: { env: Record<string, string | undefined> };

const DEFAULT_BASE_URL = 'https://aeroapi.flightaware.com/aeroapi';
const DEFAULT_MONTHLY_CENTS = 10_000;

export function flightAwareConfigured(): boolean {
  return !!process.env.FLIGHTAWARE_API_KEY;
}

export function historyEnabled(): boolean {
  return process.env.FLIGHTAWARE_HISTORY === '1';
}

export function configuredMonthlyCents(): number {
  const raw = Number(process.env.FLIGHTAWARE_MONTHLY_CENTS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MONTHLY_CENTS;
}

function baseUrl(): string {
  return (process.env.FLIGHTAWARE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
}

export interface PathProviderResponse {
  status: number;
  ok: boolean;
  /** Parsed JSON body, or null when absent or unparseable. */
  body: unknown;
}

/** One request. Never throws on an HTTP status — the route tells "no such
 * flight" (404/400) from "provider unwell" (5xx) from "refused" (401/429). */
export async function flightAwareFetch(path: string): Promise<PathProviderResponse> {
  const apiKey = process.env.FLIGHTAWARE_API_KEY;
  if (!apiKey) throw new Error('FLIGHTAWARE_API_KEY is not set');
  const response = await fetch(`${baseUrl()}${path}`, {
    headers: { 'x-apikey': apiKey, Accept: 'application/json' },
  });
  const body = response.ok ? await response.json?.().catch(() => null) : null;
  return { status: response.status, ok: response.ok, body };
}

/** The flight summaries for an ident inside a date window. The IATA number
 * the app stores is passed as a designator; the provider maps it to the
 * operator's ICAO ident, and the route confirms the match by airports. */
export const flightByIdentPath = (
  ident: string,
  window: { start: string; end: string },
  historical: boolean,
): string =>
  `${historical ? '/history' : ''}/flights/${encodeURIComponent(ident)}?ident_type=designator&start=${window.start}&end=${window.end}&max_pages=1`;

export const trackPath = (faFlightId: string, historical: boolean): string =>
  `${historical ? '/history' : ''}/flights/${encodeURIComponent(faFlightId)}/track`;

export const routePath = (faFlightId: string): string =>
  `/flights/${encodeURIComponent(faFlightId)}/route`;
