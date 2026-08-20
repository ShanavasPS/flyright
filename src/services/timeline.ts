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
}

export function travelStats(rows: JourneyRow[]): TravelStats {
  const countries = new Set<string>();
  let totalKm = 0;
  for (const row of rows) {
    totalKm += row.distanceKm;
    if (row.fromCountry) countries.add(row.fromCountry);
    if (row.toCountry) countries.add(row.toCountry);
  }
  return { trips: rows.length, totalKm: Math.round(totalKm), countries: countries.size };
}

export interface TravelRecap extends TravelStats {
  airports: number;
  airlines: number;
  /** Rounded estimate at a ~750 km/h cruise — always label it "≈" in the UI. */
  hoursAloft: number;
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
  topAirline: { carrier: string; flights: number } | null;
}

/** "Helsinki (Vantaa)" → "Helsinki"; unknown codes fall back to the code
 * itself. Grouping by the trimmed name folds co-located airports together. */
export function cityOf(iata: string): string {
  const city = getAirport(iata)?.city;
  return city ? city.replace(/\s*\(.*$/, '') : iata;
}

const EARTH_CIRCUMFERENCE_KM = 40_075;

/** "0.4× around the Earth" once past ~1% of the equator, so even a short
 * history gets a hook; below that the comparison would deflate ("0.0×"). */
export function earthComparison(totalKm: number): string | null {
  const ratio = totalKm / EARTH_CIRCUMFERENCE_KM;
  if (ratio < 0.01) return null;
  return `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}× around the Earth`;
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
    if (airline) bump(airlineCounts, airline);
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

  return {
    ...base,
    airports: airports.size,
    airlines: airlineCounts.size,
    hoursAloft: Math.round(base.totalKm / 750),
    firstYear,
    busiestYear: busiest ? { year: busiest.key, trips: busiest.count } : null,
    longest,
    shortest: shortest !== longest ? shortest : null,
    homeCity: home ? { city: home.key, departures: home.count } : null,
    topDestination: destination ? { city: destination.key, landings: destination.count } : null,
    topAirline: airline ? { carrier: airline.key, flights: airline.count } : null,
  };
}
