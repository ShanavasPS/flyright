/** When FlyRight may ask for a store rating. Pure — review-prompt.ts reads
 * the journal and the stored history and asks the OS.
 *
 * The moment is a flight FlyRight came along on: one the traveller added
 * before it left, that has landed — two hours ago at least (they are off the
 * plane and through the airport), a week at most (the trip is still fresh).
 * Trips imported after the fact don't count; the app did nothing for those.
 *
 * And never pushy: not in the first three days, not twice on one app
 * version, not within four months of the last ask, and not while another
 * flight leaves within the next six hours (the traveller is busy). The OS
 * adds its own cap on top (three a year on iOS, a quota on Android). */

import { airportZone } from '@/services/airports';
import { flightInstant } from '@/services/dates';
import { hasRealTime } from '@/services/notification-plan';
import type { JourneyRow } from '@/services/journeys';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export const SETTLE_AFTER_LANDING_MS = 2 * HOUR_MS;
export const FRESH_FOR_MS = 7 * DAY_MS;
export const FIRST_ASK_AFTER_MS = 3 * DAY_MS;
export const ASK_AGAIN_AFTER_MS = 120 * DAY_MS;
export const BUSY_BEFORE_DEPARTURE_MS = 6 * HOUR_MS;

export type ReviewJourney = Pick<
  JourneyRow,
  'mode' | 'source' | 'fromCode' | 'toCode' | 'scheduledDeparture' | 'scheduledArrival' | 'createdAt'
>;

export interface ReviewHistory {
  /** When this install first checked, ms. */
  firstSeenAt: number;
  /** The last ask, ms, or null if never. */
  lastAskedAt: number | null;
  /** The app version the last ask was on. */
  lastAskedVersion: string | null;
}

/** A flight the app accompanied, landed long enough ago to ask about. */
export function hasRecentCompletedFlight(rows: readonly ReviewJourney[], now: number): boolean {
  return rows.some((j) => {
    if (j.mode !== 'flight' || !hasRealTime(j)) return false;
    const dep = flightInstant(j.scheduledDeparture, airportZone(j.fromCode));
    const arr = flightInstant(j.scheduledArrival, airportZone(j.toCode));
    const added = Date.parse(j.createdAt);
    if (Number.isNaN(dep) || Number.isNaN(arr) || Number.isNaN(added)) return false;
    if (added >= dep) return false;
    const since = now - arr;
    return since >= SETTLE_AFTER_LANDING_MS && since <= FRESH_FOR_MS;
  });
}

/** Another flight leaves soon — not the moment for a rating. */
function departingSoon(rows: readonly ReviewJourney[], now: number): boolean {
  return rows.some((j) => {
    if (j.mode !== 'flight' || !hasRealTime(j)) return false;
    const dep = flightInstant(j.scheduledDeparture, airportZone(j.fromCode));
    return !Number.isNaN(dep) && dep > now && dep - now < BUSY_BEFORE_DEPARTURE_MS;
  });
}

export function shouldAskForReview(
  rows: readonly ReviewJourney[],
  history: ReviewHistory,
  version: string,
  now: number,
): boolean {
  if (now - history.firstSeenAt < FIRST_ASK_AFTER_MS) return false;
  if (history.lastAskedVersion === version) return false;
  if (history.lastAskedAt !== null && now - history.lastAskedAt < ASK_AGAIN_AFTER_MS) return false;
  if (departingSoon(rows, now)) return false;
  return hasRecentCompletedFlight(rows, now);
}
