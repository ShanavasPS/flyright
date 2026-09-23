import { flightInstant } from './airportZones';

export const PRO_REQUIRED = 'pro_required';
export const PRO_REMINDER_LEAD_MS = 48 * 60 * 60 * 1000;

export interface ProTrip {
  mode?: string;
  scheduledDeparture: string;
  scheduledArrival: string;
  fromCode: string;
  toCode: string;
  deletedAt?: string | null;
}

/** Bind reminders to the saved departure, including a later schedule edit. */
export function proReminderTime(trip: ProTrip): number {
  return flightInstant(trip.scheduledDeparture, trip.fromCode) - PRO_REMINDER_LEAD_MS;
}

export function canSetProReminder(trip: ProTrip, now = Date.now()): boolean {
  return !trip.deletedAt && Number.isFinite(proReminderTime(trip)) && proReminderTime(trip) > now;
}

export function proTripUpcoming(trip: ProTrip, now = Date.now()): boolean {
  return !trip.deletedAt && (!trip.mode || trip.mode === 'flight') && flightInstant(trip.scheduledDeparture, trip.fromCode) > now;
}

/** Do not treat a return leg or a visual destination group as a new opt-in. */
export function proReminderDue(trip: ProTrip, now = Date.now()): boolean {
  return proTripUpcoming(trip, now) && proReminderTime(trip) <= now;
}

/** Only future owned flights qualify for acquisition cards, never in-flight or past trips. */
export function nextProTrip<T extends ProTrip>(trips: readonly T[], now = Date.now()): T | null {
  return trips
    .filter(t => proTripUpcoming(t, now))
    .slice()
    .sort((a, b) => flightInstant(a.scheduledDeparture, a.fromCode) - flightInstant(b.scheduledDeparture, b.fromCode))[0] ?? null;
}
