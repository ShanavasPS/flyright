/** Client for GET /api/flight-path: the line a flight actually flew — or the
 * route it filed — for the trip's inset map, which draws the great circle
 * until it has one. See convex/flightPathShared.ts for what the server
 * knows and how long it keeps it.
 *
 * Asked only where an answer is possible: a lookup row with a flight number,
 * inside the window the provider can see (a couple of days ahead, and back
 * as far as the server allows). Everything else is the great circle, and
 * says so. */

import { useQuery } from '@tanstack/react-query';

import { lookupHeaders } from '@/services/flight-lookup';

/** Mirrors FlightPath in convex/flightPathShared.ts. */
export interface FlightPath {
  kind: 'track' | 'planned';
  /** [lat, lon] pairs in flying order. */
  points: [number, number][];
  /** A track is complete once the flight has landed. */
  complete: boolean;
  updatedAt: string;
}

export type FlightPathReason =
  | 'not_configured'
  | 'beyond_horizon'
  | 'not_yet'
  | 'no_data'
  | 'budget'
  | 'quota';

export interface FlightPathResult {
  path: FlightPath | null;
  reason: FlightPathReason | null;
}

export interface FlightPathSource {
  number: string;
  fromCode: string;
  toCode: string;
  /** ISO instant of the scheduled departure. */
  scheduledDeparture: string;
  scheduledArrival: string;
  /** The flight's own local date at its origin — see dates.flightDay. */
  date: string;
}

export async function lookupFlightPath(source: FlightPathSource): Promise<FlightPathResult> {
  const params = new URLSearchParams({
    flight: source.number,
    date: source.date,
    from: source.fromCode,
    to: source.toCode,
    departure: source.scheduledDeparture,
  });
  const response = await fetch(`/api/flight-path?${params}`, { headers: await lookupHeaders() });
  if (!response.ok) throw new Error(`flight-path ${response.status}`);
  return (await response.json()) as FlightPathResult;
}

const HOUR_MS = 3_600_000;

/** A filed route appears a few hours before departure; further ahead than
 * this there is nothing to ask for. */
const ASK_AHEAD_MS = 48 * HOUR_MS;
/** How long after the timetable's landing a flight is still treated as
 * possibly in the air (delays, holding). */
const IN_AIR_SLACK_MS = 3 * HOUR_MS;

/** Whether it is worth asking the server at all right now. */
export function pathWorthAsking(scheduledDeparture: string, now: number): boolean {
  const departure = Date.parse(scheduledDeparture);
  return !Number.isNaN(departure) && departure - now < ASK_AHEAD_MS;
}

/** The map's path for a trip, kept fresh while the flight is in the air.
 * `null` when there is none (yet, or at all) — the caller draws its great
 * circle. `source` null disables the query (a manual entry, the demo). */
export function useFlightPath(source: FlightPathSource | null, now: number): FlightPath | null {
  const enabled = !!source && pathWorthAsking(source.scheduledDeparture, now);
  const query = useQuery({
    queryKey: ['flight-path', source?.number, source?.date, source?.fromCode, source?.toCode],
    queryFn: () => lookupFlightPath(source!),
    enabled,
    retry: false,
    // A finished track never changes; anything else is asked again on the
    // next open. The server's own cache makes that cheap.
    staleTime: (query) => (query.state.data?.path?.complete ? Infinity : 2 * 60_000),
    refetchInterval: (query) => {
      if (!source) return false;
      const data = query.state.data;
      // A track still growing: follow it.
      if (data?.path?.kind === 'track' && !data.path.complete) return 2 * 60_000;
      // In the air by the timetable but nothing drawn yet: the track may
      // start any minute.
      const departure = Date.parse(source.scheduledDeparture);
      const arrival = Date.parse(source.scheduledArrival);
      const airborne = now >= departure && now <= arrival + IN_AIR_SLACK_MS;
      return airborne && !data?.path ? 5 * 60_000 : false;
    },
  });
  return query.data?.path ?? null;
}
