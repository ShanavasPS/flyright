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

/** Where the aircraft was last seen — a flight in the air, from the
 * provider's ADS-B feed (`withLocation`). Null on the ground, and over
 * oceans and other stretches without receiver coverage, where the map has
 * to dead-reckon along the route instead. */
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

/** The provider's `location` → FlightPosition. Its timestamp comes without
 * a zone suffix ("2026-09-18 15:11") though it is UTC, so one is added; a
 * record with no usable coordinates or time is no position at all. */
export function normalizePosition(location: any): FlightPosition | null {
  if (!location || typeof location !== 'object') return null;
  const latitude = Number(location.lat);
  const longitude = Number(location.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const stamp = toIso(location.reportedAtUtc);
  if (!stamp) return null;
  const reportedAt = /(Z|[+-]\d\d:?\d\d)$/.test(stamp) ? stamp : `${stamp}Z`;
  if (Number.isNaN(Date.parse(reportedAt))) return null;
  // The QNH-corrected altitude reads 0 when the provider has no pressure
  // setting; the pressure altitude is the one that is always there.
  const altitude = Number(location.altitude?.feet);
  const pressureAltitude = Number(location.pressureAltitude?.feet);
  const altitudeFt = altitude > 0 ? altitude : pressureAltitude > 0 ? pressureAltitude : null;
  const groundSpeed = Number(location.groundSpeed?.kt);
  const track = Number(location.trueTrack?.deg);
  return {
    latitude,
    longitude,
    altitudeFt,
    groundSpeedKt: Number.isFinite(groundSpeed) ? groundSpeed : null,
    trackDeg: Number.isFinite(track) ? track : null,
    reportedAt,
  };
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
  /** When the provider last revised this record. A schedule that predates
   * the ticket in hand is older news than the ticket, whatever it says. */
  scheduleUpdatedAt: string | null;
  gate: string | null;
  terminal: string | null;
  checkInDesk: string | null;
  baggageBelt: string | null;
  boardingTime: string | null;
  estimatedDeparture: string | null;
  actualDeparture: string | null;
  estimatedArrival: string | null;
  actualArrival: string | null;
  /** Last reported position while airborne; null otherwise. */
  position: FlightPosition | null;
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

/** Statuses that mean the aircraft is in the air. */
const AIRBORNE = ['Departed', 'EnRoute', 'Approaching'];

/** Statuses that say outright the flight has left the gate. */
const LEFT = ['Departed', 'EnRoute', 'Approaching', 'Arrived', 'Diverted'];

/** Statuses under which the flight is certainly still at its origin. A
 * runway stamp on such a record is the provider's ESTIMATE — its spec
 * defines `runwayTime` as "actual / estimated time on the runway", and a
 * delayed Transavia leg carried its estimated touchdown (scheduled block
 * plus the delay) three hours before take-off. Read as an actual, that
 * said "Landed 17:06" to a traveller still at the gate (2026-09-24). */
const AT_ORIGIN = ['Expected', 'CheckIn', 'Boarding', 'GateClosed', 'Delayed', 'Canceled', 'CanceledUncertain'];

/** Whether a runway/actual stamp records something that has happened: the
 * status says so outright, or the stamp is already behind the clock on a
 * record that does not say the flight is still at the gate. */
export function stampHappened(
  stamp: string | undefined | null,
  status: string | undefined,
  saysDone: readonly string[],
  now: number,
): boolean {
  if (!stamp) return false;
  if (status && saysDone.includes(status)) return true;
  if (status && AT_ORIGIN.includes(status)) return false;
  const at = Date.parse(toIso(stamp) ?? '');
  return Number.isFinite(at) && at <= now;
}

/** How long past its last expected arrival an airborne record is taken as
 * landed anyway. Some arrival feeds never close a flight out — Kochi left
 * an Etihad leg at "Departed" for three months — and without this the
 * flight reads as still to come, which it plainly isn't. A day covers any
 * real diversion or holding pattern. */
const OVERDUE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Normalize one provider leg.
 *
 * AeroDataBox's live fields: `runwayTime` is the touchdown/take-off time,
 * actual once it has happened and an estimate before (stampHappened tells
 * them apart); `revisedTime` the airline's current estimate — which, once
 * the flight has landed, is the last known gate-arrival time. `predictedTime`
 * exists even for unflown flights. `actualTime` is not in the provider's
 * schema; it is read for records from tests and older captures only.
 */
export function normalizeLeg(
  leg: any,
  flight: string,
  date: string,
  inbound: Record<string, unknown> | null = null,
  now: number = Date.now(),
): NormalizedFlight {
  const dep = leg.departure ?? {};
  const arr = leg.arrival ?? {};

  // Landed as reported, or landed because it must have: an airborne record
  // a day past its last expected arrival. The second kind has no arrival
  // time to read, so it carries no delay and earns no verdict.
  const arrStamp: string | undefined = arr.actualTime?.utc ?? arr.runwayTime?.utc;
  const reported = leg.status === 'Arrived' || stampHappened(arrStamp, leg.status, ['Arrived'], now);
  const dueAt = arr.revisedTime?.utc ?? arr.predictedTime?.utc ?? arr.scheduledTime?.utc;
  const overdue =
    !reported && AIRBORNE.includes(leg.status) && !!dueAt && now - Date.parse(dueAt) > OVERDUE_AFTER_MS;
  const landed = reported || overdue;
  const actualArrival = reported ? (arrStamp ?? arr.revisedTime?.utc) : null;
  // A runway stamp that has not happened yet is the estimated touchdown —
  // the only estimate some records carry, and what the delay reads off.
  const runwayEstimate = reported ? undefined : arrStamp;

  const depStamp: string | undefined = dep.actualTime?.utc ?? dep.runwayTime?.utc;
  const departed = stampHappened(depStamp, leg.status, LEFT, now);

  const scheduled = arr.scheduledTime?.utc;
  const arrivalBasis = landed
    ? actualArrival
    : (arr.revisedTime?.utc ??
      (OPERATING.includes(leg.status) ? (arr.predictedTime?.utc ?? runwayEstimate) : null));
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
    scheduleUpdatedAt: toIso(leg.lastUpdatedUtc),
    gate: dep.gate ?? null,
    terminal: dep.terminal ?? null,
    checkInDesk: dep.checkInDesk ?? null,
    baggageBelt: arr.baggageBelt ?? null,
    // AeroDataBox has no separate boarding time; the widget derives one.
    boardingTime: null,
    estimatedDeparture: toIso(
      dep.predictedTime?.utc ?? dep.revisedTime?.utc ?? (departed ? undefined : depStamp),
    ),
    actualDeparture: toIso(departed ? depStamp : null),
    estimatedArrival: toIso(arr.predictedTime?.utc ?? arr.revisedTime?.utc ?? runwayEstimate),
    actualArrival: toIso(actualArrival),
    // A landed flight's last fix is history, not a position.
    position: landed ? null : normalizePosition(leg.location),
  };
}

/**
 * The leg that actually departs on the day asked about.
 *
 * `/flights/number/{flight}/{date}` defaults to `dateLocalRole=Both`: every
 * leg that departs OR arrives on that local date comes back, in departure
 * order. For an overnight flight — Doha 19:40, Kochi 02:45 — a question about
 * day D is therefore answered with two legs, and the FIRST is yesterday's,
 * which merely lands on D. Taking `legs[0]` adopted that leg's times as a
 * "schedule change", and because the next lookup asked about the new day the
 * trip walked back 24 h per lookup until it was history (QR516, Sep 2026).
 *
 * Judged on the origin's local date, which is what the provider indexes by;
 * the UTC stamp stands in when a record has no local one. Falls back to the
 * first leg when none departs on the date — the provider's whole answer then
 * lands on a neighbouring day (a date typed from the arrival side of the
 * ticket), and a neighbouring day's flight beats "not found".
 */
export function legDepartingOn(legs: unknown, date: string): any | null {
  if (!Array.isArray(legs) || legs.length === 0) return null;
  const departsOn = (leg: any): boolean => {
    const time = leg?.departure?.scheduledTime;
    const stamp: string | undefined = time?.local ?? time?.utc;
    return typeof stamp === 'string' && stamp.slice(0, 10) === date;
  };
  return legs.find(departsOn) ?? legs[0];
}

/** The subset the live-session poll chain writes onto its session row. */
export interface FlightFactsPatch {
  flightStatus: string | null;
  delayMinutes: number | null;
  gate: string | null;
  terminal: string | null;
  checkInDesk: string | null;
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
    checkInDesk: facts.checkInDesk,
    baggageBelt: facts.baggageBelt,
    estimatedDeparture: facts.estimatedDeparture,
    actualDeparture: facts.actualDeparture,
    estimatedArrival: facts.estimatedArrival,
    actualArrival: facts.actualArrival,
  };
}
