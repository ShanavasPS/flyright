/** The words in a "trip added" push — pure, so the app's tests can read them.
 *
 * A follower's question is "when?", answered the way a friend would: "flying
 * tomorrow", "in 2 days", "in a week", "in 3 weeks" — and only past that,
 * a date. The count of trips is detail, so it lives in the body. */

import { airportZone, flightDay } from './airportZones';

export type PushTrip = {
  number: string;
  carrier: string;
  fromCode: string;
  toCode: string;
  scheduledDeparture: string;
};

/** Whole calendar days from today to the flight, both read on the departure
 * airport's calendar — the day the traveller is actually living by. A
 * zone-less departure is already a wall clock and keeps its own date. */
export function daysUntil(scheduledDeparture: string, fromCode: string, now: Date): number {
  const flight = flightDay(scheduledDeparture, fromCode);
  const zone = airportZone(fromCode);
  let today: string;
  try {
    today = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone ?? 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    today = now.toISOString().slice(0, 10);
  }
  return Math.round((Date.parse(`${flight}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

/** "Sat 18 Jan" on the departure airport's calendar. */
export function dayLabel(scheduledDeparture: string, fromCode: string): string {
  const zone = airportZone(fromCode);
  const zoned = /(Z|[+-]\d\d:?\d\d)$/.test(scheduledDeparture);
  // A wall clock is read as UTC so the formatter prints it unchanged.
  const at = new Date(zoned ? scheduledDeparture : `${scheduledDeparture}Z`);
  if (Number.isNaN(at.getTime())) return scheduledDeparture.slice(0, 10);
  try {
    // Assembled from parts: en-GB's short September is "Sept", en-US puts
    // the month first — "Wed 9 Sep" is neither locale's default.
    const parts = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: zoned ? zone ?? 'UTC' : 'UTC',
    }).formatToParts(at);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${part('weekday')} ${part('day')} ${part('month')}`;
  } catch {
    return scheduledDeparture.slice(0, 10);
  }
}

/** "tomorrow", "in 2 days", "in a week" (7–10 days), "in 2 weeks", "in 3
 * weeks", and from about a month out the date itself. */
export function relativeDay(days: number, label: string): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1 && days < 7) return `in ${days} days`;
  if (days >= 7 && days < 25) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? 'in a week' : `in ${weeks} weeks`;
  }
  return `on ${label}`;
}

/** Title and body for "<owner> added trips", for one batch of trips that
 * are all in the future and sorted soonest first by the caller. */
export function tripsAddedCopy(ownerName: string, trips: PushTrip[], now: Date) {
  const [first] = trips;
  const label = dayLabel(first.scheduledDeparture, first.fromCode);
  const when = relativeDay(daysUntil(first.scheduledDeparture, first.fromCode, now), label);
  const leg = `${first.number || first.carrier} · ${first.fromCode} → ${first.toCode} · ${label}`;
  return {
    title: `${ownerName} is flying ${when}`,
    body:
      trips.length > 1
        ? `${trips.length} trips added — first ${leg}. You'll get a heads-up the day before each.`
        : `${leg}. You'll get a heads-up the day before.`,
  };
}
