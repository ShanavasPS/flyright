/** The provider's flight record → the shape the app consumes.
 *
 * There is exactly one normalizer because there is exactly one cache. The
 * flight-status route and the travel-day poll chain used to each have their
 * own (the route's rich version, and a four-field subset in flightData.ts),
 * which was harmless while they each bought their own answers and fatal once
 * they share them: two shapes under one cache key is a bug waiting for the
 * first cache hit. So both call this, the rich shape is what gets cached, and
 * the poll chain narrows it afterwards (`factsPatch`).
 *
 * Pure — no ctx, no I/O, no env.
 */

import { carrierFor } from './carriersShared';

/** AeroDataBox uses "2026-08-10 08:00Z"; the app stores strict ISO. */
export function toIso(s: string | undefined | null): string | null {
  return s ? s.replace(' ', 'T') : null;
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

/** The normalized response. Mirrors FlightStatus in
 * src/services/flight-lookup.ts, which is what the client parses. */
export interface NormalizedFlight {
  aircraft: { reg: string; model: string | null } | null;
  inbound: Record<string, unknown> | null;
  flight: string;
  date: string;
  status: string;
  landed: boolean;
  delayMinutes: number | null;
  distanceKm: number | null;
  carrier: { name: string; iata: string };
  carrierCountry: string;
  from: { code: string | null; country: string | null };
  to: { code: string | null; country: string | null };
  scheduledDeparture: string | null;
  scheduledArrival: string | null;
  gate: string | null;
  terminal: string | null;
  checkInDesk: string | null;
  baggageBelt: string | null;
  boardingTime: string | null;
  estimatedDeparture: string | null;
  actualDeparture: string | null;
  estimatedArrival: string | null;
  actualArrival: string | null;
}

/** Statuses in which the flight is under way. Before landing, an
 * airline-announced revision always counts as a delay signal, but
 * predictedTime is a speculative ML estimate that exists for flights days
 * away, so it only counts once the flight is operating. */
const OPERATING = [
  'CheckIn',
  'Boarding',
  'GateClosed',
  'Departed',
  'EnRoute',
  'Approaching',
  'Delayed',
  'Diverted',
];

/** A slip within a few minutes of schedule is jitter, not a delay; delay
 * alerts start at 30 min, so a 15-min floor loses no signal. */
const PREDICTED_SLIP_MIN = 15;

/**
 * Normalize one provider leg.
 *
 * AeroDataBox's live fields: `runwayTime` is an actual (touchdown/takeoff),
 * `revisedTime` the airline's current estimate — which, once the flight has
 * landed, is the last known gate-arrival time (`actualTime` often never fills
 * in). `predictedTime` exists even for unflown flights.
 */
export function normalizeLeg(
  leg: any,
  flight: string,
  date: string,
  inbound: Record<string, unknown> | null = null,
): NormalizedFlight {
  const dep = leg.departure ?? {};
  const arr = leg.arrival ?? {};

  const landed = leg.status === 'Arrived' || !!arr.actualTime?.utc || !!arr.runwayTime?.utc;
  const actualArrival =
    arr.actualTime?.utc ?? arr.runwayTime?.utc ?? (landed ? arr.revisedTime?.utc : null);

  const scheduled = arr.scheduledTime?.utc;
  const arrivalBasis = landed
    ? actualArrival
    : (arr.revisedTime?.utc ?? (OPERATING.includes(leg.status) ? arr.predictedTime?.utc : null));
  const rawDelay =
    scheduled && arrivalBasis
      ? Math.max(0, Math.round((Date.parse(arrivalBasis) - Date.parse(scheduled)) / 60000))
      : null;
  const delayMinutes = landed || (rawDelay ?? 0) >= PREDICTED_SLIP_MIN ? rawDelay : null;

  const carrier = carrierFor(flight);
  const reg = leg.aircraft?.reg as string | undefined;

  return {
    aircraft: reg ? { reg, model: leg.aircraft?.model ?? null } : null,
    inbound,
    flight,
    date,
    status: leg.status ?? 'unknown',
    landed,
    delayMinutes,
    distanceKm: leg.greatCircleDistance?.km ?? null,
    carrier: { name: leg.airline?.name ?? carrier.name, iata: leg.airline?.iata ?? carrier.iata },
    carrierCountry: carrier.country,
    from: { code: dep.airport?.iata ?? null, country: dep.airport?.countryCode ?? null },
    to: { code: arr.airport?.iata ?? null, country: arr.airport?.countryCode ?? null },
    scheduledDeparture: toIso(dep.scheduledTime?.utc),
    scheduledArrival: toIso(arr.scheduledTime?.utc),
    gate: dep.gate ?? null,
    terminal: dep.terminal ?? null,
    checkInDesk: dep.checkInDesk ?? null,
    baggageBelt: arr.baggageBelt ?? null,
    // AeroDataBox has no separate boarding time; the widget derives one.
    boardingTime: null,
    estimatedDeparture: toIso(dep.predictedTime?.utc ?? dep.revisedTime?.utc),
    actualDeparture: toIso(dep.actualTime?.utc ?? dep.runwayTime?.utc),
    estimatedArrival: toIso(arr.predictedTime?.utc ?? arr.revisedTime?.utc),
    actualArrival: toIso(actualArrival),
  };
}

/** The subset the live-session poll chain writes onto its session row. */
export interface FlightFactsPatch {
  flightStatus: string | null;
  delayMinutes: number | null;
  gate: string | null;
  terminal: string | null;
  baggageBelt: string | null;
  estimatedDeparture: string | null;
  actualDeparture: string | null;
  estimatedArrival: string | null;
  actualArrival: string | null;
}

/** Narrow a normalized record to what a live session stores. Works equally on
 * a fresh normalization and on one parsed back out of the cache. */
export function factsPatch(facts: NormalizedFlight): FlightFactsPatch {
  return {
    // The session row has always stored null for "the provider didn't say",
    // where the client-facing shape uses the string 'unknown'. Keep that.
    flightStatus: facts.status === 'unknown' ? null : facts.status,
    delayMinutes: facts.delayMinutes,
    gate: facts.gate,
    terminal: facts.terminal,
    baggageBelt: facts.baggageBelt,
    estimatedDeparture: facts.estimatedDeparture,
    actualDeparture: facts.actualDeparture,
    estimatedArrival: facts.estimatedArrival,
    actualArrival: facts.actualArrival,
  };
}
