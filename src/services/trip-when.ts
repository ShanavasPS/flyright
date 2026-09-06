/** How far off a trip is, in the words a profile uses. Pure — no RN, no
 * Intl beyond what dates.ts already relies on — so the unit tests stay cheap.
 *
 * Deliberately coarse. A follower reading someone else's travel wants "in 3
 * months", not a countdown; the exact clock is on the trip itself. */
export function relativeWhen(iso: string, now: Date = new Date()): string | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  // Whole days apart by calendar date, not by elapsed hours: a flight at
  // 23:00 tonight and one at 01:00 tomorrow are "today" and "tomorrow", not
  // both "in 0 days".
  const days = Math.round((startOfDay(then) - startOfDay(now.getTime())) / 86_400_000);
  if (days < 0) return pastLabel(-days);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `In ${days} days`;
  if (days < 14) return 'Next week';
  if (days < 60) return `In ${Math.round(days / 7)} weeks`;
  const months = Math.round(days / 30);
  return months < 12 ? `In ${months} months` : 'In over a year';
}

function pastLabel(days: number): string {
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} months ago` : 'Over a year ago';
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
