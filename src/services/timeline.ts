/** Pure grouping/stats helpers for the My travels timeline — UI-free, testable. */

import { getAirport } from '@/services/airports';
import type { JourneyRow } from '@/services/journeys';

export interface TimelineSection {
  key: string;
  title: string;
  data: JourneyRow[];
}

/** "Upcoming" (soonest first) followed by past years, newest year first.
 * Sorts internally, so callers can pass rows in any order. */
export function groupJourneys(rows: JourneyRow[], now: Date): TimelineSection[] {
  const cutoff = now.getTime();
  const upcoming: JourneyRow[] = [];
  const past: JourneyRow[] = [];
  for (const row of rows) {
    (Date.parse(row.scheduledDeparture) >= cutoff ? upcoming : past).push(row);
  }
  upcoming.sort((a, b) => Date.parse(a.scheduledDeparture) - Date.parse(b.scheduledDeparture));
  past.sort((a, b) => Date.parse(b.scheduledDeparture) - Date.parse(a.scheduledDeparture));

  const sections: TimelineSection[] = [];
  if (upcoming.length) {
    sections.push({ key: 'upcoming', title: 'Upcoming', data: upcoming });
  }
  for (const row of past) {
    const year = row.scheduledDeparture.slice(0, 4);
    const current = sections[sections.length - 1];
    if (current && current.key === year) {
      current.data.push(row);
    } else {
      sections.push({ key: year, title: year, data: [row] });
    }
  }
  return sections;
}

export interface TravelStats {
  trips: number;
  totalKm: number;
  countries: number;
  /** Time in the air: the real block time of every trip that has zoned
   * timestamps, plus a ~750 km/h cruise estimate for the rest. */
  hoursAloft: number;
  /** True when at least one trip had to be estimated — label the total "≈". */
  hoursEstimated: boolean;
}

/** A typical long-haul cruise, for trips whose times can't be trusted. */
const CRUISE_KMH = 750;

/** Block time in minutes when both timestamps carry a UTC offset (lookup rows
 * do; manual entries store bare wall-clock times whose difference is
 * meaningless across time zones). Null otherwise, and for implausible spans. */
export function blockMinutes(departure: string, arrival: string): number | null {
  const zoned = /(Z|[+-]\d\d:\d\d)$/;
  if (!zoned.test(departure) || !zoned.test(arrival)) return null;
  const minutes = Math.round((Date.parse(arrival) - Date.parse(departure)) / 60_000);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 36 * 60) return null;
  return minutes;
}

export function travelStats(rows: JourneyRow[]): TravelStats {
  const countries = new Set<string>();
  let totalKm = 0;
  let minutesAloft = 0;
  let hoursEstimated = false;
  for (const row of rows) {
    totalKm += row.distanceKm;
    if (row.fromCountry) countries.add(row.fromCountry);
    if (row.toCountry) countries.add(row.toCountry);
    const block = blockMinutes(row.scheduledDeparture, row.scheduledArrival);
    if (block === null) {
      minutesAloft += (row.distanceKm / CRUISE_KMH) * 60;
      hoursEstimated = true;
    } else {
      minutesAloft += block;
    }
  }
  return {
    trips: rows.length,
    totalKm: Math.round(totalKm),
    countries: countries.size,
    hoursAloft: Math.round(minutesAloft / 6) / 10,
    hoursEstimated,
  };
}

/** The headline kilometre figure. Grouped digits up to six of them; from a
 * million on, a compact "1.2M" — seven-plus digits at display size overflow
 * the stats column and shrink to the unreadable. */
export function formatKm(totalKm: number): string {
  if (totalKm >= 10_000_000) return `${Math.round(totalKm / 1_000_000)}M`;
  if (totalKm >= 1_000_000) return `${(totalKm / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return Math.round(totalKm).toLocaleString();
}

const HOURS_PER_DAY = 24;
const HOURS_PER_WEEK = 7 * HOURS_PER_DAY;
const HOURS_PER_MONTH = 30.44 * HOURS_PER_DAY;

/** "14 hours in the air" → "2.5 days" → "3 weeks" → "1.5 months": the flown
 * time in whatever unit keeps the number small enough to feel. One decimal
 * under ten, whole numbers above; null under an hour, where it'd deflate. */
export function timeAloftComparison(hoursAloft: number): string | null {
  if (hoursAloft < 1) return null;
  const unit =
    hoursAloft < 2 * HOURS_PER_DAY
      ? { name: 'hour', hours: 1 }
      : hoursAloft < 2 * HOURS_PER_WEEK
        ? { name: 'day', hours: HOURS_PER_DAY }
        : hoursAloft < 2 * HOURS_PER_MONTH
          ? { name: 'week', hours: HOURS_PER_WEEK }
          : { name: 'month', hours: HOURS_PER_MONTH };
  const raw = hoursAloft / unit.hours;
  const value = unit.name === 'hour' || raw >= 10 ? Math.round(raw) : Math.round(raw * 10) / 10;
  const label = value === 1 ? unit.name : `${unit.name}s`;
  return `${value} ${label} in the air`;
}

export interface TravelRecap extends TravelStats {
  airports: number;
  airlines: number;
  firstYear: string | null;
  /** Null when every trip falls in the same year — nothing to compare. */
  busiestYear: { year: string; trips: number } | null;
  longest: JourneyRow | null;
  /** Null until there are two trips with different distances — a single trip
   * being both "longest" and "shortest" reads as a bug, not a record. */
  shortest: JourneyRow | null;
  /** Where the most trips depart from — the closest the data gets to "home". */
  homeCity: { city: string; departures: number } | null;
  /** Most-landed-in city, excluding home: without that carve-out every return
   * leg would crown the user's own city their top destination. */
  topDestination: { city: string; landings: number } | null;
  /** `number` is a sample flight number from that airline's rows, so the UI
   * can derive the carrier's IATA code for its logo. */
  topAirline: { carrier: string; flights: number; number: string } | null;
  /** The airline the traveler rates highest (mean of their 1–5 stars, ties
   * to the one rated more often). Null until at least one flight is rated. */
  favouriteAirline: { carrier: string; rating: number; rated: number; number: string } | null;
}

/** "Helsinki (Vantaa)" → "Helsinki"; unknown codes fall back to the code
 * itself. Grouping by the trimmed name folds co-located airports together. */
export function cityOf(iata: string): string {
  const city = getAirport(iata)?.city;
  return city ? city.replace(/\s*\(.*$/, '') : iata;
}

/** Manual entries without a recognised flight number store the mode label
 * ("Flight") as the carrier — a placeholder, not an airline. */
export function airlineOf(row: JourneyRow): string | null {
  return row.carrier.toLowerCase() === row.mode ? null : row.carrier;
}

function bump(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** Highest count wins; ties keep the first key seen (Map insertion order). */
function top(counts: Map<string, number>): { key: string; count: number } | null {
  let best: { key: string; count: number } | null = null;
  for (const [key, count] of counts) {
    if (!best || count > best.count) best = { key, count };
  }
  return best;
}

/** Everything the Travel stats screen shows, in one pass over the rows. */
export function travelRecap(rows: JourneyRow[]): TravelRecap {
  const base = travelStats(rows);
  const airports = new Set<string>();
  const airlineCounts = new Map<string, number>();
  const airlineNumbers = new Map<string, string>();
  const ratingSums = new Map<string, { sum: number; count: number }>();
  const departureCities = new Map<string, number>();
  const arrivalCities = new Map<string, number>();
  const yearCounts = new Map<string, number>();
  let longest: JourneyRow | null = null;
  let shortest: JourneyRow | null = null;
  let firstYear: string | null = null;

  for (const row of rows) {
    airports.add(row.fromCode);
    airports.add(row.toCode);
    const airline = airlineOf(row);
    if (airline) {
      bump(airlineCounts, airline);
      if (row.number && !airlineNumbers.has(airline)) airlineNumbers.set(airline, row.number);
      if (row.rating != null) {
        const acc = ratingSums.get(airline) ?? { sum: 0, count: 0 };
        ratingSums.set(airline, { sum: acc.sum + row.rating, count: acc.count + 1 });
      }
    }
    bump(departureCities, cityOf(row.fromCode));
    bump(arrivalCities, cityOf(row.toCode));
    const year = row.scheduledDeparture.slice(0, 4);
    bump(yearCounts, year);
    if (!firstYear || year < firstYear) firstYear = year;
    if (!longest || row.distanceKm > longest.distanceKm) longest = row;
    if (!shortest || row.distanceKm < shortest.distanceKm) shortest = row;
  }

  const home = top(departureCities);
  const away = new Map([...arrivalCities].filter(([city]) => city !== home?.key));
  // All-arrivals fallback covers the one-way traveller whose every landing is "home".
  const destination = top(away) ?? top(arrivalCities);
  const busiest = yearCounts.size > 1 ? top(yearCounts) : null;
  const airline = top(airlineCounts);
  let favourite: { carrier: string; rating: number; rated: number } | null = null;
  for (const [carrier, { sum, count }] of ratingSums) {
    const rating = sum / count;
    if (
      !favourite ||
      rating > favourite.rating ||
      (rating === favourite.rating && count > favourite.rated)
    )
      favourite = { carrier, rating, rated: count };
  }

  return {
    ...base,
    airports: airports.size,
    airlines: airlineCounts.size,
    firstYear,
    busiestYear: busiest ? { year: busiest.key, trips: busiest.count } : null,
    longest,
    shortest: shortest !== longest ? shortest : null,
    homeCity: home ? { city: home.key, departures: home.count } : null,
    topDestination: destination ? { city: destination.key, landings: destination.count } : null,
    topAirline: airline
      ? {
          carrier: airline.key,
          flights: airline.count,
          number: airlineNumbers.get(airline.key) ?? '',
        }
      : null,
    favouriteAirline: favourite
      ? { ...favourite, number: airlineNumbers.get(favourite.carrier) ?? '' }
      : null,
  };
}
