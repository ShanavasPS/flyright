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

/** How far back the year wheel reaches. A journal can hold a lifetime of
 * old passes; next year is as far ahead as anything gets booked. */
export const YEARS_BACK = 60;

/** The years the wheel offers, newest first: next year, this one, then
 * sixty back — stretched to include whatever the date already says, so the
 * current value is always on the wheel. Newest first because the wrong
 * guess is usually a year ahead and the right answer sits just below it. */
export function yearChoices(iso: string, today: Date): number[] {
  const now = today.getFullYear();
  const current = Number(iso.slice(0, 4));
  const top = Math.max(now + 1, current);
  const bottom = Math.min(now - YEARS_BACK, current);
  const years: number[] = [];
  for (let y = top; y >= bottom; y--) years.push(y);
  return years;
}
