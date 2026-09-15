/** Pure rules for the flight-path lookups — the recorded track a flight
 * actually flew, or the route it filed — shared by the hosting route that
 * serves them (src/app/api/flight-path+api.ts), the Convex functions that
 * cache and meter them (flightPaths.ts) and tests. No ctx, no I/O, no env.
 *
 * The path comes from a second provider (FlightAware AeroAPI), not the one
 * behind the status lookups, and it is priced differently: per *result set*
 * of 15 records, so a long-haul track of 600 positions costs forty times a
 * one-line flight summary. Everything below exists to buy each path once,
 * keep it exactly as long as the licence allows, and never spend more than
 * the month's cap on it.
 *
 * Licence facts this file encodes (AeroAPI Standard License, Nov 2022):
 *  - raw data may be stored for at most 30 days from first receipt
 *    (PATH_CACHE_MAX_AGE_MS; the prune cron enforces it)
 *  - the filed-route decoder only knows navaids inside US airspace, so a
 *    European flight's filed route often has no coordinates at all —
 *    normalizeRoute answers null for those rather than a two-point line
 *  - none of this data may feed a passenger-rights claim; a path is a
 *    picture on a map and nothing in the claims engine reads it
 */

export type FlightPathKind = 'track' | 'planned';

/** What the app draws: a polyline in [lat, lon] pairs, in flying order. */
export interface FlightPath {
  kind: FlightPathKind;
  points: [number, number][];
  /** A track is complete once the flight has landed; a filed route never is
   * (it is a plan, and the aircraft is still to fly it). */
  complete: boolean;
  /** When this was last observed, ISO. */
  updatedAt: string;
}

/** The provider's answer, including "asked, and there is nothing" — cached
 * too, or a flight with no coverage is bought again on every open. */
export type FlightPathAnswer = FlightPath | null;

// -- AeroAPI shapes (the subset read) ----------------------------------------

export interface AeroFlight {
  fa_flight_id: string;
  ident_iata?: string | null;
  origin?: { code_iata?: string | null } | null;
  destination?: { code_iata?: string | null } | null;
  scheduled_out?: string | null;
  scheduled_off?: string | null;
  actual_off?: string | null;
  actual_on?: string | null;
  actual_in?: string | null;
  cancelled?: boolean;
  diverted?: boolean;
  position_only?: boolean;
  progress_percent?: number | null;
}

export interface AeroPosition {
  latitude: number;
  longitude: number;
  timestamp: string;
  /** P = projected: an estimate, not an observation. */
  update_type?: string | null;
}

export interface AeroFix {
  name?: string;
  latitude?: number | null;
  longitude?: number | null;
  type?: string;
}

// -- picking the flight ---------------------------------------------------------

/** How far from the journey's own departure a candidate may be scheduled and
 * still be the same flight: a day covers any zone confusion between the two
 * providers, and the airports rule out the rest. */
const SAME_FLIGHT_WINDOW_MS = 36 * 3_600_000;

/**
 * The AeroAPI flight that is this journey. The ident lookup returns every
 * leg flying that number over two weeks — outbound and return, yesterday's
 * and tomorrow's — so the airports must match and the schedule must be the
 * nearest to the journey's own departure instant. Cancellations are skipped:
 * nothing flew.
 */
export function pickFlight(
  flights: AeroFlight[],
  journey: { from: string; to: string; departure: string },
): AeroFlight | null {
  const departure = Date.parse(journey.departure);
  let best: AeroFlight | null = null;
  let bestGap = SAME_FLIGHT_WINDOW_MS;
  for (const flight of flights) {
    if (flight.cancelled) continue;
    if (flight.origin?.code_iata !== journey.from) continue;
    if (flight.destination?.code_iata !== journey.to) continue;
    const scheduled = Date.parse(flight.scheduled_out ?? flight.scheduled_off ?? '');
    if (Number.isNaN(scheduled) || Number.isNaN(departure)) continue;
    const gap = Math.abs(scheduled - departure);
    if (gap < bestGap) {
      bestGap = gap;
      best = flight;
    }
  }
  return best;
}

/** Whether the flight has taken off — the point from which there is a track
 * to draw rather than a plan. */
export const hasDeparted = (flight: AeroFlight): boolean => !!flight.actual_off;

/** Whether the track is final: the flight is on the ground at the far end. */
export const hasLanded = (flight: AeroFlight): boolean =>
  !!flight.actual_on || !!flight.actual_in || flight.progress_percent === 100;

// -- normalizing --------------------------------------------------------------

/** Points closer than this to the line between their neighbours are dropped
 * (Douglas–Peucker, in degrees — about 1.5 km at the equator). Well under
 * the width of a stroke on a 220pt map, and it turns a 600-position track
 * into a few dozen points. */
const SIMPLIFY_TOLERANCE_DEG = 0.015;
/** Ceiling on stored points; the tolerance doubles until a track fits. */
const MAX_POINTS = 400;

function validPoint(lat: unknown, lon: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

/** Perpendicular distance of `p` from the line through `a` and `b`, in the
 * same (degree) units. Longitude is not scaled by latitude: this is a
 * drawing tolerance, not a geodesic one, and the error only makes the
 * simplifier slightly more conservative near the poles. */
function offLine(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[1] - a[1];
  const dy = b[0] - a[0];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[1] - a[1]) * dx + (p[0] - a[0]) * dy) / lengthSq));
  return Math.hypot(p[0] - (a[0] + dy * t), p[1] - (a[1] + dx * t));
}

/** Douglas–Peucker, iterative so a long track cannot blow the stack. Keeps
 * both endpoints. */
export function simplify(points: [number, number][], tolerance: number): [number, number][] {
  if (points.length <= 2) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let index = -1;
    let furthest = tolerance;
    for (let i = first + 1; i < last; i += 1) {
      const d = offLine(points[i], points[first], points[last]);
      if (d > furthest) {
        furthest = d;
        index = i;
      }
    }
    if (index !== -1) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Simplify until the track fits the ceiling. */
export function compact(points: [number, number][]): [number, number][] {
  let tolerance = SIMPLIFY_TOLERANCE_DEG;
  let result = simplify(points, tolerance);
  while (result.length > MAX_POINTS) {
    tolerance *= 2;
    result = simplify(result, tolerance);
  }
  return result;
}

/** The recorded track, as the app draws it: observed positions only, in
 * time order, simplified. Null when there are fewer than two — a flight the
 * provider saw take off but never tracked draws nothing rather than a dot. */
export function normalizeTrack(
  positions: AeroPosition[] | null | undefined,
  complete: boolean,
  now: number,
): FlightPath | null {
  if (!Array.isArray(positions)) return null;
  const ordered = positions
    .filter((p) => p && p.update_type !== 'P' && validPoint(p.latitude, p.longitude))
    .map((p) => ({ at: Date.parse(p.timestamp ?? ''), point: [p.latitude, p.longitude] as [number, number] }))
    .filter((p) => !Number.isNaN(p.at))
    .sort((a, b) => a.at - b.at)
    .map((p) => p.point);
  if (ordered.length < 2) return null;
  return {
    kind: 'track',
    points: compact(ordered),
    complete,
    updatedAt: new Date(now).toISOString(),
  };
}

/** The filed route's fixes, as far as the provider could place them. Fixes
 * without coordinates (anything outside US navaid coverage) are skipped; a
 * route left with fewer than two placed fixes is no route — the great
 * circle the app already draws is a better guess than a straight line
 * between the only two fixes it recognised. */
export function normalizeRoute(fixes: AeroFix[] | null | undefined, now: number): FlightPath | null {
  if (!Array.isArray(fixes)) return null;
  const points = fixes
    .filter((f) => f && validPoint(f.latitude, f.longitude))
    .map((f) => [f.latitude as number, f.longitude as number] as [number, number]);
  // Fewer than three placed fixes means the decoder only knew the
  // endpoints, and that is the great circle drawn worse.
  if (points.length < 3) return null;
  return { kind: 'planned', points: compact(points), complete: false, updatedAt: new Date(now).toISOString() };
}

// -- retention ----------------------------------------------------------------

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** The licence's ceiling on storing what the provider sent: thirty days
 * from first receipt. Nothing in the cache outlives it. */
export const PATH_CACHE_MAX_AGE_MS = 30 * DAY_MS;

/** How long an answer stays usable. A landed flight's track never changes
 * again; one in the air gains positions by the minute; a filed route can be
 * refiled up to departure; "nothing yet" is asked again soon before the
 * flight, and rarely once it is over. */
export function pathExpiry(answer: FlightPathAnswer, flight: AeroFlight | null, now: number): number {
  if (answer?.kind === 'track') return now + (answer.complete ? PATH_CACHE_MAX_AGE_MS : 2 * MINUTE_MS);
  if (answer?.kind === 'planned') return now + 20 * MINUTE_MS;
  // No path. How soon it is worth asking again depends on where the flight
  // is: still to fly, in the air uncovered, or long down with no coverage.
  if (flight && hasDeparted(flight)) {
    return now + (hasLanded(flight) ? 7 * DAY_MS : 5 * MINUTE_MS);
  }
  return now + 15 * MINUTE_MS;
}

// -- the provider's window and prices ----------------------------------------

/** The live endpoints reach back ten days; older flights live behind the
 * history endpoints, which cost several times more and need the Standard
 * tier. A day of slack keeps a flight from falling in the crack between the
 * two around midnight. */
export const LIVE_HORIZON_DAYS = 9;
/** The live ident lookup accepts `end` at most two days out. */
export const LIVE_FUTURE_DAYS = 2;

export function isHistorical(departure: string, now: number): boolean {
  const at = Date.parse(departure);
  return !Number.isNaN(at) && now - at > LIVE_HORIZON_DAYS * DAY_MS;
}

/** The `start`/`end` window for the ident lookup around a journey's own
 * departure instant, clamped to what the live endpoint accepts. Null when
 * the flight is too far ahead for the provider to know anything yet. */
export function lookupWindow(
  departure: string,
  now: number,
): { start: string; end: string } | null {
  const at = Date.parse(departure);
  if (Number.isNaN(at)) return null;
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const start = Math.max(at - DAY_MS, now - LIVE_HORIZON_DAYS * DAY_MS);
  const end = Math.min(at + DAY_MS, now + LIVE_FUTURE_DAYS * DAY_MS);
  if (day(start) >= day(end)) return null;
  return { start: day(start), end: day(end) };
}

/** The history ident lookup takes a window of at most seven days. */
export function historyWindow(departure: string): { start: string; end: string } | null {
  const at = Date.parse(departure);
  if (Number.isNaN(at)) return null;
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { start: day(at - DAY_MS), end: day(at + DAY_MS) };
}

/** The provider's list prices, in US cents per result set (15 records),
 * from flightaware.com/commercial/aeroapi as read on 2026-09-15. History
 * endpoints are the Standard tier's. These are what the monthly cap counts
 * in; an invoice that disagrees means this table is stale. */
export const PRICE_CENTS = {
  flight: 0.5,
  track: 1.2,
  route: 1,
  historyFlight: 2,
  historyTrack: 6,
} as const;

export type PricedCall = keyof typeof PRICE_CENTS;

/** Result sets billed for a response holding `records` items (a page of
 * flights, a track's positions, a route's fixes). An empty answer still
 * costs one. */
export function resultSets(records: number): number {
  return Math.max(1, Math.ceil(records / 15));
}

export function callCents(call: PricedCall, records: number): number {
  return PRICE_CENTS[call] * resultSets(records);
}

/** Whether the provider bills the response: a processed request (including
 * a genuine "nothing found") costs money; a refusal or an outage does not. */
export function pathProviderBills(status: number, ok: boolean): boolean {
  return ok || status === 404;
}

/** Daily per-caller ceilings on fresh path lookups, so a runaway client or
 * an enumeration script is bounded well before the monthly cap is. Cached
 * answers are free and uncounted. */
export const PATH_LIMITS = { user: 150, anonymous: 30 } as const;

/** Cache key: one answer per flight per origin-local day. */
export function pathKey(flight: string, date: string): string {
  return `${flight}:${date}`;
}
