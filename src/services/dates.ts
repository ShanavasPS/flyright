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
