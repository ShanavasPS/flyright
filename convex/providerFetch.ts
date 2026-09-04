/** The one place that speaks HTTP to the aviation-data provider.
 *
 * Shared by both runtimes that call it — the EAS Hosting route on Cloudflare
 * Workers and Convex actions — because both read `process.env` and both need
 * the same auth, the same unit accounting, and the same view of what the
 * provider says is left. Previously each had its own `fetch` with the
 * RapidAPI host hard-coded in it, which is why moving off RapidAPI used to
 * mean editing code in two places.
 *
 * The route to the API is configuration, not code. The same endpoints are
 * resold by RapidAPI, by API.Market and by the vendor's own portal, each on
 * its own host with its own key header and its own price per unit, so all
 * three are reachable by setting env vars:
 *
 *   RapidAPI (default)  BASE_URL=https://aerodatabox.p.rapidapi.com
 *                       KEY_HEADER=X-RapidAPI-Key
 *   API.Market          BASE_URL=https://prod.api.market/api/v1/aedbx/aerodatabox
 *                       KEY_HEADER=x-api-market-key
 *   Direct portal       BASE_URL / KEY_HEADER per the portal's docs
 *
 * Defaults reproduce the RapidAPI behaviour exactly, so an unset environment
 * keeps working.
 */

import {
  UNITS_PER_FLIGHT_CALL,
  readProviderBudget,
  type ProviderBudgetReading,
} from './providerShared';

declare const process: { env: Record<string, string | undefined> };

const DEFAULT_BASE_URL = 'https://aerodatabox.p.rapidapi.com';
const DEFAULT_KEY_HEADER = 'X-RapidAPI-Key';

export function providerConfigured(): boolean {
  return !!process.env.AERODATABOX_API_KEY;
}

function baseUrl(): string {
  return (process.env.AERODATABOX_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
}

/** The monthly pool size, for the backstop counter used when the provider
 * sends no budget headers of its own. Set it to the plan's included units. */
export function configuredMonthlyUnits(): number | null {
  const raw = Number(process.env.AERODATABOX_MONTHLY_UNITS);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export interface ProviderResponse {
  status: number;
  ok: boolean;
  /** Parsed JSON body, or null when absent or unparseable (the API answers
   * 204 with an empty body for a flight it has no data for). */
  body: unknown;
  /** What the provider says is left of the monthly pool, when it says. */
  budget: ProviderBudgetReading | null;
  /** Units this call cost, for the local backstop counter. */
  units: number;
}

/**
 * One request to the provider. Never throws on an HTTP status — callers all
 * need to distinguish "no such flight" (404/204) from "provider is unwell"
 * (5xx) from "pool is spent" (429), and each maps those differently.
 */
export async function providerFetch(path: string): Promise<ProviderResponse> {
  const apiKey = process.env.AERODATABOX_API_KEY;
  if (!apiKey) throw new Error('AERODATABOX_API_KEY is not set');

  const url = `${baseUrl()}${path}`;
  const headers: Record<string, string> = {
    [process.env.AERODATABOX_KEY_HEADER || DEFAULT_KEY_HEADER]: apiKey,
  };
  // RapidAPI's gateway routes by this header; nothing else needs it.
  const host = new URL(url).host;
  if (host.endsWith('.p.rapidapi.com')) headers['X-RapidAPI-Host'] = host;

  const response = await fetch(url, { headers });
  // Only a success has a body worth reading. An error response may carry no
  // JSON at all (a gateway's HTML, or 204's empty body), and no caller needs
  // it — the status alone decides what each one does.
  const body =
    response.ok && response.status !== 204
      ? await response.json?.().catch(() => null)
      : null;

  return {
    status: response.status,
    ok: response.ok,
    body,
    // Route unit tests stub fetch with a bare `{ ok, status, json }`, so the
    // header bag may be absent; a missing reading just means the local
    // backstop counter decides instead.
    budget: readProviderBudget((name) => response.headers?.get?.(name) ?? null),
    units: UNITS_PER_FLIGHT_CALL,
  };
}

/** Convenience for the two endpoints the app uses. */
export const flightByNumberPath = (flight: string, date: string): string =>
  `/flights/number/${encodeURIComponent(flight)}/${date}`;

export const flightsByRegistrationPath = (reg: string, date: string): string =>
  `/flights/reg/${encodeURIComponent(reg)}/${date}`;
