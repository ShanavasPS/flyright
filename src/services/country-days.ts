/** Days spent in each country per year, from the journal and the home base —
 * what a traveller needs for the day counts in tax rules. See
 * docs/country-days.md.
 *
 * A day counts in a country if the traveller was there for any part of it:
 * the rule of the OECD model's 183-day test in tax treaties, the US
 * substantial presence test and Canada's 183-day rule. Arrival and departure
 * days both count, so a travel day counts in two countries. The UK's
 * statutory residence test counts midnights instead, so every country also
 * carries its midnights. A connection under 24 hours (one itinerary in
 * chainLegs) is transit and counts nowhere, as those rules exclude transit.
 *
 * A stay runs from a landing to the next take-off. When that take-off leaves
 * from another country, a flight is missing: the landing day and the
 * take-off day still count, the days between are "not sure" and are never
 * given to a country. Pure logic, no React. */
import { airportZone, countryName } from '@/services/airports';
import { legInstant } from '@/services/connections';
import { flightDay, localDateString } from '@/services/dates';
import { airportPlace, doorToDoor, type HomePlace } from '@/services/home-base';
import type { JourneyRow } from '@/services/journeys';
import { flagEmoji } from '@/services/travel-recap';

const DAY_MS = 86_400_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** One stretch in one country, as it falls in the year asked about. */
export interface CountryStay {
  country: string;
  city: string;
  /** Local calendar days, inclusive, clipped to the year: the landing day
   * and the take-off day. */
  from: string;
  to: string;
  /** Days of this stretch inside the year. */
  days: number;
  /** Midnights spent there inside the year (the UK's count). */
  midnights: number;
  /** The flight that brought the traveller here, if one did. */
  arrivalId: string | null;
  /** The flight they left on; null while they are still there. */
  departureId: string | null;
}

export interface CountryDays {
  country: string;
  name: string;
  flag: string;
  days: number;
  midnights: number;
  /** Cities of its stays, most days first. */
  cities: string[];
  /** Newest first. */
  stays: CountryStay[];
  /** The home base's country at the end of the period. */
  home: boolean;
}

/** Days a missing flight leaves unaccounted for: landed in one country, next
 * took off from another. */
export interface UnknownSpan {
  from: string;
  to: string;
  days: number;
  landedIn: string;
  leftFrom: string;
  /** The flight after which one seems to be missing. */
  afterId: string;
}

export interface YearDays {
  year: number;
  /** The period counted: 1 Jan to 31 Dec, or to today for this year. */
  start: string;
  end: string;
  partial: boolean;
  /** Most days first. */
  countries: CountryDays[];
  notSure: UnknownSpan[];
  notSureDays: number;
  homeCountry: string | null;
  /** Days in countries other than the home country (a travel day there can
   * also be a home day). */
  abroadDays: number;
}

interface Interval {
  country: string;
  city: string;
  from: string;
  to: string;
  /** Nights spent there: none when only a travel day is known. */
  nights: boolean;
  arrivalId: string | null;
  departureId: string | null;
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

function departureDay(row: JourneyRow): string {
  return flightDay(row.scheduledDeparture, airportZone(row.fromCode)).slice(0, 10);
}

function arrivalDay(row: JourneyRow): string {
  const arrived = legInstant(row.scheduledArrival, row.toCode);
  const departed = legInstant(row.scheduledDeparture, row.fromCode);
  // A placeholder arrival (missing, or not after the take-off) says nothing
  // about the landing day; the take-off day is the best known day.
  if (!Number.isFinite(arrived) || !(arrived > departed)) return departureDay(row);
  return flightDay(row.scheduledArrival, airportZone(row.toCode)).slice(0, 10);
}

/** Door-to-door flights already taken, oldest first. The same flight logged
 * twice (same route, same take-off) counts once: two copies would read as a
 * landing followed by a take-off from where the first one left. */
function flown(rows: JourneyRow[], now: number): JourneyRow[] {
  const seen = new Set<string>();
  return doorToDoor(rows)
    .filter((r) => {
      const at = legInstant(r.scheduledDeparture, r.fromCode);
      if (!Number.isFinite(at) || at > now || !DAY.test(departureDay(r))) return false;
      const key = `${r.fromCode}:${r.toCode}:${at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => legInstant(a.scheduledDeparture, a.fromCode) - legInstant(b.scheduledDeparture, b.fromCode));
}

function timeline(rows: JourneyRow[], home: (day: string) => HomePlace | null, now: number, today: string) {
  const flights = flown(rows, now);
  const intervals: Interval[] = [];
  const unknown: UnknownSpan[] = [];
  const first = flights[0];
  if (first) {
    // Before the first flight in the journal: at home, when that flight
    // leaves from home. Otherwise only its take-off day is known.
    const leaves = airportPlace(first.fromCode, first.fromCountry);
    const day = departureDay(first);
    const homeThen = home(day);
    const fromHome = !!homeThen && !!leaves.country && homeThen.country === leaves.country;
    intervals.push({
      country: leaves.country, city: leaves.city, from: fromHome ? '0000-01-01' : day, to: day,
      nights: fromHome, arrivalId: null, departureId: first.id,
    });
  }
  flights.forEach((a, i) => {
    const b = flights[i + 1];
    const landed = airportPlace(a.toCode, a.toCountry);
    const from = arrivalDay(a);
    if (!b) {
      // Still there: the last landing counts up to today.
      intervals.push({ country: landed.country, city: landed.city, from, to: today < from ? from : today, nights: true, arrivalId: a.id, departureId: null });
      return;
    }
    const left = airportPlace(b.fromCode, b.fromCountry);
    const to = departureDay(b);
    if (landed.country && landed.country === left.country) {
      intervals.push({ country: landed.country, city: landed.city, from, to: to < from ? from : to, nights: true, arrivalId: a.id, departureId: b.id });
      return;
    }
    // A flight is missing between these two: count the days that are known.
    intervals.push({ country: landed.country, city: landed.city, from, to: from, nights: false, arrivalId: a.id, departureId: null });
    intervals.push({ country: left.country, city: left.city, from: to, to, nights: false, arrivalId: null, departureId: b.id });
    const gapFrom = addDays(from, 1);
    const gapTo = addDays(to, -1);
    if (gapFrom <= gapTo) unknown.push({ from: gapFrom, to: gapTo, days: daysBetween(gapFrom, gapTo) + 1, landedIn: landed.city, leftFrom: left.city, afterId: a.id });
  });
  return { intervals, unknown };
}

/** The years a journal can be read for, newest first: from the first flight's
 * year to this year. */
export function countryDayYears(rows: JourneyRow[], now = Date.now()): number[] {
  const flights = flown(rows, now);
  if (!flights.length) return [];
  const first = Number(departureDay(flights[0]!).slice(0, 4));
  const last = Number(localDateString(new Date(now)).slice(0, 4));
  const years: number[] = [];
  for (let y = last; y >= first; y--) years.push(y);
  return years;
}

/** Days per country in one calendar year (to today for the current one). */
export function countryDays(
  rows: JourneyRow[],
  year: number,
  home: (day: string) => HomePlace | null,
  now = Date.now(),
): YearDays {
  const today = localDateString(new Date(now));
  const start = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const end = today < yearEnd ? today : yearEnd;
  const partial = end < yearEnd;
  const { intervals, unknown } = timeline(rows, home, now, today);
  const homeCountry = home(end)?.country || null;

  const byCountry = new Map<string, { days: Set<string>; midnights: number; stays: CountryStay[]; cityDays: Map<string, number> }>();
  const counted = new Set<string>();
  for (const iv of intervals) {
    if (!iv.country) continue;
    const from = iv.from > start ? iv.from : start;
    const to = iv.to < end ? iv.to : end;
    if (from > to) continue;
    const entry = byCountry.get(iv.country) ?? { days: new Set<string>(), midnights: 0, stays: [] as CountryStay[], cityDays: new Map<string, number>() };
    byCountry.set(iv.country, entry);
    // The same city on the same days twice (a flight logged twice) is one stay.
    if (entry.stays.some((st) => st.city === iv.city && st.from === from && st.to === to)) continue;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      entry.days.add(d);
      counted.add(d);
    }
    // A midnight belongs to the day it ends; the last day's midnight is
    // spent somewhere else (or not yet reached).
    const beforeLeaving = addDays(iv.to, -1);
    const lastNight = beforeLeaving < end ? beforeLeaving : end;
    const midnights = iv.nights && lastNight >= from ? daysBetween(from, lastNight) + 1 : 0;
    entry.midnights += midnights;
    const days = daysBetween(from, to) + 1;
    entry.cityDays.set(iv.city, (entry.cityDays.get(iv.city) ?? 0) + days);
    // Dates as they fall in the year: a stay over New Year shows its part.
    entry.stays.push({ country: iv.country, city: iv.city, from, to, days, midnights, arrivalId: iv.arrivalId, departureId: iv.departureId });
  }

  const notSure: UnknownSpan[] = [];
  let notSureDays = 0;
  for (const span of unknown) {
    const from = span.from > start ? span.from : start;
    const to = span.to < end ? span.to : end;
    if (from > to) continue;
    let days = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) if (!counted.has(d)) days++;
    if (!days) continue;
    notSure.push({ ...span, from, to, days });
    notSureDays += days;
  }

  const countries: CountryDays[] = [...byCountry.entries()].map(([country, e]) => ({
    country,
    name: countryName(country),
    flag: flagEmoji(country),
    days: e.days.size,
    midnights: e.midnights,
    cities: [...e.cityDays.entries()].sort((a, b) => b[1] - a[1]).map(([city]) => city),
    stays: e.stays.sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : 0)),
    home: country === homeCountry,
  }));
  countries.sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
  const abroadDays = countries.filter((c) => !c.home).reduce((n, c) => n + c.days, 0);
  return { year, start, end, partial, countries, notSure: notSure.sort((a, b) => (a.from < b.from ? 1 : -1)), notSureDays, homeCountry, abroadDays };
}
