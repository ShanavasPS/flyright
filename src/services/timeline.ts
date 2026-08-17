/** Pure grouping/stats helpers for the My travels timeline — UI-free, testable. */

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
