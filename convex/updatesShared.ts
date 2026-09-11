/**
 * Trip updates — pure rules shared by the Convex functions (what may be
 * posted, what a follower is told) and the app (whether to offer the
 * composer), so a traveller is never offered a post the server would refuse.
 *
 * An update is a photo, a line of text, or both, posted by the traveller
 * from inside a trip: the airport, the plane, the first day at the other
 * end. The app fills in the context (the stage they were at, the airport it
 * happened at) so the traveller types nothing but the words.
 */

import { airportZone, flightDay, flightInstant } from './airportZones';

/** Room for a sentence or two — a caption, not a post. */
export const UPDATE_TEXT_MAX = 200;

/** How long after the flight lands the trip still takes updates: the
 * arrival, the hotel, the first morning. The next flight opens its own. */
export const UPDATE_WINDOW_AFTER_MS = 24 * 60 * 60_000;

export interface UpdateTrip {
  fromCode: string;
  toCode: string;
  scheduledDeparture: string;
  scheduledArrival: string;
}

/** The instants a trip takes updates between: midnight at the origin on the
 * departure day, to a day after the flight is due to land (a recorded
 * landing that ran later extends it). NaN bounds mean the times can't be
 * placed, and the window is treated as closed. */
export function updateWindow(
  trip: UpdateTrip,
  landedAt: string | null = null,
): { opensAt: number; closesAt: number } {
  const zone = airportZone(trip.fromCode);
  const day = flightDay(trip.scheduledDeparture, trip.fromCode);
  const opensAt = zone
    ? flightInstant(`${day}T00:00`, trip.fromCode)
    : flightInstant(trip.scheduledDeparture, trip.fromCode) - 12 * 60 * 60_000;
  const due = flightInstant(trip.scheduledArrival, trip.toCode);
  const landed = landedAt ? Date.parse(landedAt) : NaN;
  const closesAt = Math.max(due, Number.isFinite(landed) ? landed : -Infinity) + UPDATE_WINDOW_AFTER_MS;
  return { opensAt, closesAt };
}

export function updateWindowOpen(trip: UpdateTrip, now: number, landedAt: string | null = null): boolean {
  const { opensAt, closesAt } = updateWindow(trip, landedAt);
  return Number.isFinite(opensAt) && Number.isFinite(closesAt) && now >= opensAt && now <= closesAt;
}

/** Where the traveller was when they posted, from what the live session
 * knows (or, without one, from the timetable): the origin until the flight
 * leaves, nowhere in particular while it flies, the destination once it has
 * landed. */
export function placeFor(
  trip: UpdateTrip,
  stage: string | null,
  now: number,
): string | null {
  if (stage === 'landed') return trip.toCode;
  if (stage === 'departed') return null;
  if (stage) return trip.fromCode;
  const dep = flightInstant(trip.scheduledDeparture, trip.fromCode);
  const arr = flightInstant(trip.scheduledArrival, trip.toCode);
  if (Number.isFinite(arr) && now >= arr) return trip.toCode;
  if (Number.isFinite(dep) && now >= dep) return null;
  return trip.fromCode;
}
