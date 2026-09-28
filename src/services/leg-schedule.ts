/** When an imported leg departs and arrives. One rule, one home — see
 * legSchedule below for why the ticket outranks the flight lookup. */

import { airportZone, getAirport } from '@/services/airports';
import { zonedTimestamp } from '@/services/dates';
import { haversineKm } from '@/services/geo';
import type { FlightStatus } from '@/services/flight-lookup';
import type { ImportedSegment } from '@/services/itinerary';

/** One leg's departure and arrival, used both by the card the traveler
 * reviews and by the row that gets saved, so the two can never disagree.
 *
 * **The ticket wins.** The times printed down the itinerary are the airport's
 * own clocks and they are what the traveler will be holding at the gate; the
 * provider's answer for a flight months out is a projection off a schedule
 * that may not have caught a re-time. The lookup only fills in a time the
 * document never printed.
 *
 * A printed time becomes the instant it names at its airport ("11:30" at ARN
 * on 28 November is 10:30Z), because the countdown, the travel-day window and
 * the departure reminder are all instant arithmetic — the screens read the
 * clock back out of it in the airport's own zone. For an airport the table
 * doesn't carry, the bare wall clock is kept instead: still the right thing
 * to show, just not something to count down to.
 */
export function legSchedule(
  segment: Pick<ImportedSegment, 'date' | 'arrivalDate' | 'depTime' | 'arrTime' | 'fromCode' | 'toCode' | 'duration'>,
  flight: Pick<FlightStatus, 'date' | 'from' | 'to' | 'scheduledDeparture' | 'scheduledArrival'> | null,
): { departure: string | null; arrival: string | null } {
  const day = segment.date ?? flight?.date ?? null;
  const printed = (clock: string | null, on: string | null, iata: string | null) => {
    if (!clock || !on) return null;
    return zonedTimestamp(on, clock, airportZone(iata)) ?? `${on}T${clock}:00`;
  };
  const departure =
    printed(segment.depTime, day, flight?.from.code ?? segment.fromCode) ??
    flight?.scheduledDeparture ??
    null;
  // The printed arrival clock is trusted; the date it is pinned to is not
  // always the leg's. A booking PDF prints fare-validity dates and the next
  // leg's date beside the row, and one of those taken as the arrival turned a
  // ten-hour LHR→DFW into a twelve-day flight (1.1.5, five legs on one
  // account). What decides the day, strongest first:
  //  1. the flight time the document prints — departure plus duration is the
  //     arrival instant, time zones and all, so the printed clock goes on the
  //     day that lands nearest it (or, with no clock printed, that instant);
  //  2. the printed arrival date, when it makes a flight of this departure
  //     on this route (maxFlightMs: a limit that grows with the distance);
  //  3. the provider's scheduled arrival;
  //  4. the clocks' own day (an arrival clock before the departure clock
  //     lands the next day).
  const to = flight?.to.code ?? segment.toCode;
  const byClock = day && segment.depTime && segment.arrTime && segment.arrTime < segment.depTime ? addDays(day, 1) : day;
  const candidates = [
    byDuration(departure, segment.duration ?? null, day, segment.arrTime, (on) => printed(segment.arrTime, on, to)),
    printed(segment.arrTime, plausibleArrivalDate(day, segment.arrivalDate) ?? byClock, to),
    flight?.scheduledArrival ?? null,
    printed(segment.arrTime, byClock, to),
  ];
  const maxMs = maxFlightMs(flight?.from.code ?? segment.fromCode, to);
  const arrival = candidates.find((c) => !!c && fitsFlight(departure, c, maxMs)) ?? candidates.find(Boolean) ?? null;
  return { departure, arrival };
}

/** How far the printed clock may sit from departure plus the printed flight
 * time: a document rounds, and a schedule change moves one and not the other. */
const DURATION_SLACK_MS = 90 * 60_000;

/** The arrival the document's own flight time points at: the printed clock
 * on whichever day (the day before to two after, as the date line allows)
 * lands nearest departure + duration, or that instant itself when no clock
 * was printed. Null without a measurable departure or a duration, or when no
 * day puts the clock within DURATION_SLACK_MS of it. */
function byDuration(
  departure: string | null,
  duration: number | null,
  day: string | null,
  arrTime: string | null,
  on: (day: string) => string | null,
): string | null {
  if (!departure || !duration || !day || !INSTANT.test(departure)) return null;
  const expected = Date.parse(departure) + duration * 60_000;
  if (!Number.isFinite(expected)) return null;
  if (!arrTime) return new Date(expected).toISOString();
  let best: { iso: string; off: number } | null = null;
  for (const offset of [-1, 0, 1, 2]) {
    const iso = on(addDays(day, offset));
    if (!iso || !INSTANT.test(iso)) continue;
    const off = Math.abs(Date.parse(iso) - expected);
    if (!best || off < best.off) best = { iso, off };
  }
  return best && best.off <= DURATION_SLACK_MS ? best.iso : null;
}

/** How long a flight between two airports can plausibly take: the
 * great-circle distance at a slow 800 km/h plus an hour for taxi and climb,
 * doubled and three hours more for headwinds, detours and a stop made under
 * one flight number (QF1 Sydney–Singapore–London, ~24 h). Sydney–London
 * allows ~47 h; Dallas–Milwaukee ~8 h, so a "flight" of a day there is a
 * date from elsewhere on the page. Without both airports' coordinates the
 * distance is unknown and only an absurd gap is refused. */
const HOUR_MS = 3_600_000;
const UNKNOWN_ROUTE_MAX_MS = 48 * HOUR_MS;

export function maxFlightMs(fromCode: string | null, toCode: string | null): number {
  const from = fromCode ? getAirport(fromCode) : undefined;
  const to = toCode ? getAirport(toCode) : undefined;
  if (!from || !to) return UNKNOWN_ROUTE_MAX_MS;
  const estimate = haversineKm(from.lat, from.lon, to.lat, to.lon) / 800 + 1;
  return (2 * estimate + 3) * HOUR_MS;
}

const DAY_MS = 86_400_000;

/** A printed arrival date that can belong to a flight leaving on `date`: the
 * day before (eastbound over the date line) up to two days after (westbound
 * over it). Anything further is a date from elsewhere on the page. */
export function plausibleArrivalDate(date: string | null, arrivalDate: string | null): string | null {
  if (!date || !arrivalDate) return null;
  const days = (Date.parse(`${arrivalDate}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS;
  return Number.isFinite(days) && days >= -1 && days <= 2 ? arrivalDate : null;
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const INSTANT = /(Z|[+-]\d{2}:?\d{2})$/;

/** Whether an arrival makes a flight of this departure on this route. A
 * bare wall clock (an airport without a zone) is no instant to measure, so
 * it is let be. */
function fitsFlight(departure: string | null, arrival: string, maxMs: number): boolean {
  if (!departure || !INSTANT.test(departure) || !INSTANT.test(arrival)) return true;
  const gap = Date.parse(arrival) - Date.parse(departure);
  return Number.isFinite(gap) && gap > 0 && gap <= maxMs;
}
