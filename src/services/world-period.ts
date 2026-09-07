import { airportZone } from '@/services/airports';
import { flightDay } from '@/services/dates';
import type { JourneyRow } from '@/services/journeys';

/** Which slice of the journal the World map draws.
 *
 * Everything is measured in *flight days* — the calendar date of departure at
 * the origin airport — so a 23:50 flight out of Los Angeles counts for the day
 * on its boarding pass, not for the UTC day it is stored under. Range bounds
 * are inclusive `YYYY-MM-DD` days for the same reason: the traveller thinks in
 * dates, and string comparison on that shape is a correct date comparison. */
export type WorldPeriod =
  | { kind: 'all' }
  | { kind: 'year'; year: number }
  /** `month` is 1–12. */
  | { kind: 'month'; year: number; month: number }
  | { kind: 'range'; from: string; to: string };

export const ALL_TIME: WorldPeriod = { kind: 'all' };

/** Departure date at the origin, `YYYY-MM-DD`. */
export function journeyDay(row: Pick<JourneyRow, 'scheduledDeparture' | 'fromCode'>): string {
  return flightDay(row.scheduledDeparture, airportZone(row.fromCode));
}

export function inPeriod(day: string, period: WorldPeriod): boolean {
  switch (period.kind) {
    case 'all':
      return true;
    case 'year':
      return day.startsWith(`${period.year}-`);
    case 'month':
      return day.startsWith(`${period.year}-${pad(period.month)}-`);
    case 'range':
      return day >= period.from && day <= period.to;
  }
}

export function filterByPeriod<T extends Pick<JourneyRow, 'scheduledDeparture' | 'fromCode'>>(
  rows: T[],
  period: WorldPeriod,
): T[] {
  if (period.kind === 'all') return rows;
  return rows.filter((row) => inPeriod(journeyDay(row), period));
}

/** Stable identity for a period, for memo deps and "did it change" checks. */
export function periodKey(period: WorldPeriod): string {
  switch (period.kind) {
    case 'all':
      return 'all';
    case 'year':
      return `y:${period.year}`;
    case 'month':
      return `m:${period.year}-${pad(period.month)}`;
    case 'range':
      return `r:${period.from}..${period.to}`;
  }
}

/** Years with at least one flight, newest first. */
export function yearsWithFlights(rows: Pick<JourneyRow, 'scheduledDeparture' | 'fromCode'>[]) {
  const years = new Set<number>();
  for (const row of rows) years.add(Number(journeyDay(row).slice(0, 4)));
  return [...years].sort((a, b) => b - a);
}

/** Months (1–12) of `year` with at least one flight. */
export function monthsWithFlights(
  rows: Pick<JourneyRow, 'scheduledDeparture' | 'fromCode'>[],
  year: number,
): Set<number> {
  const months = new Set<number>();
  for (const row of rows) {
    const day = journeyDay(row);
    if (day.startsWith(`${year}-`)) months.add(Number(day.slice(5, 7)));
  }
  return months;
}

/** First and last flight day in the journal — the starting point for a custom
 * range, so entering "Custom" never begins with an empty map. */
export function journalSpan(
  rows: Pick<JourneyRow, 'scheduledDeparture' | 'fromCode'>[],
): { from: string; to: string } | null {
  let from: string | null = null;
  let to: string | null = null;
  for (const row of rows) {
    const day = journeyDay(row);
    if (!from || day < from) from = day;
    if (!to || day > to) to = day;
  }
  return from && to ? { from, to } : null;
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function monthShort(month: number): string {
  return MONTHS_SHORT[month - 1] ?? '';
}

/** "2 Mar 2025" for a `YYYY-MM-DD` day; the year drops when `withYear` is false. */
export function formatDay(day: string, withYear = true): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return `${d} ${monthShort(m)}${withYear ? ` ${y}` : ''}`;
}

/** "All time", "2025", "Nov 2025" / "November 2025", and for a range
 * "2 Mar – 14 Apr 2025" (year once when both ends share it) in the long form
 * or "2 Mar – 14 Apr" in the short. The short form is for the header pill,
 * which shares its row with the title; the card it opens carries the dates. */
export function periodLabel(period: WorldPeriod, long = false): string {
  switch (period.kind) {
    case 'all':
      return 'All time';
    case 'year':
      return `${period.year}`;
    case 'month':
      return `${long ? MONTHS_LONG[period.month - 1] : monthShort(period.month)} ${period.year}`;
    case 'range': {
      if (period.from === period.to) return formatDay(period.from, long);
      if (!long) return `${formatDay(period.from, false)} – ${formatDay(period.to, false)}`;
      const sameYear = period.from.slice(0, 4) === period.to.slice(0, 4);
      return `${formatDay(period.from, !sameYear)} – ${formatDay(period.to)}`;
    }
  }
}

function pad(n: number): string {
  return `${n}`.padStart(2, '0');
}
