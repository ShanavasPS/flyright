/** The year of a date, as a thing to change on its own.
 *
 * Boarding-pass barcodes carry no year and receipts are opened months after
 * the trip, so the one part of a date the app has to guess is the year — and
 * a wrong guess turns a flown trip into an upcoming one. These helpers back
 * the year chip beside a date: the years worth offering, and the same date
 * moved to another year. Pure, no RN. */

/** `iso` with its year replaced. 29 Feb in a year without one becomes 28 Feb. */
export function withYear(iso: string, year: number): string {
  const [, mm, dd] = iso.split('-');
  const y = `${year}`.padStart(4, '0');
  const candidate = `${y}-${mm}-${dd}`;
  const d = new Date(`${candidate}T12:00:00`);
  if (Number.isNaN(+d) || d.getDate() !== Number(dd)) return `${y}-${mm}-28`;
  return candidate;
}

/** `iso` moved by whole years, so an arrival that was the day after a
 * departure stays the day after it across a New Year. */
export function shiftYears(iso: string, delta: number): string {
  return withYear(iso, Number(iso.slice(0, 4)) + delta);
}

/** How far back the year chooser reaches. A journal is years of old
 * passes and receipts; next year is as far ahead as anything gets booked. */
export const YEARS_BACK = 10;

/** The years a traveller could mean, newest first: next year, this one,
 * then a decade back — plus whatever the date already says, if it is
 * outside that. Newest first because the wrong guess is usually a year
 * ahead and the right answer is a step or two below it. */
export function yearChoices(iso: string, today: Date): number[] {
  const now = today.getFullYear();
  const years = new Set<number>([Number(iso.slice(0, 4))]);
  for (let y = now + 1; y >= now - YEARS_BACK; y--) years.add(y);
  return [...years].sort((a, b) => b - a);
}
