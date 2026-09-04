/** Pure date helpers for journey rows — kept UI-free so they're testable. */

/** 'YYYY-MM-DD' in the device's local calendar, offset by `days`. */
export function localDateString(base: Date, days = 0): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** "Wed, 5 Aug" — the short label Flighty-style chips and rows use. */
export function formatDayLabel(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "5 Aug 2015" — for past rows where a weekday or a "3650 days ago"
 * countdown reads worse than the plain date. */
export function formatDayLabelWithYear(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "08:00" local time from an ISO timestamp; '—' when unknown. */
export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** The big left-column label on journey rows: time until (or since) departure. */
export function countdown(departureIso: string, now: Date): { value: number; unit: string } {
  const ms = Date.parse(departureIso) - now.getTime();
  const abs = Math.abs(ms);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);

  if (abs < 3_600_000) return { value: 0, unit: 'now' };
  if (hours < 48) return { value: hours, unit: ms >= 0 ? 'hours' : 'hours ago' };
  return { value: days, unit: ms >= 0 ? 'days' : 'days ago' };
}

/** Calendar-day distance from `now` to `iso`, in the device's local zone —
 * "tomorrow" is the next calendar day, not 24 hours away. */
function calendarDayDiff(iso: string, now: Date): number {
  const target = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOf(target) - startOf(now)) / 86_400_000);
}

/** The journey screen's title: how far off the trip is while that's the
 * more useful reading (a week either way), the date itself beyond that —
 * with the year once the trip isn't in this one. */
export function travelDayTitle(departureIso: string, now: Date): string {
  if (Number.isNaN(Date.parse(departureIso))) return '';
  const diff = calendarDayDiff(departureIso, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff <= 7) return `In ${diff} days`;
  if (diff < -1 && diff >= -7) return `${-diff} days ago`;
  const sameYear = new Date(departureIso).getFullYear() === now.getFullYear();
  return sameYear ? formatDayLabel(departureIso) : formatDayLabelWithYear(departureIso);
}


/** "today at 09:15", "yesterday", "3 days ago", or the dated form — the
 * tail of a "Edited …" stamp, so recent edits read as recency and old ones
 * as a date. */
export function editedLabel(iso: string, now: Date): string {
  if (Number.isNaN(Date.parse(iso))) return '';
  const diff = calendarDayDiff(iso, now);
  if (diff === 0) return `today at ${formatTime(iso)}`;
  if (diff === -1) return 'yesterday';
  if (diff < -1 && diff >= -7) return `${-diff} days ago`;
  return formatDayLabelWithYear(iso);
}
