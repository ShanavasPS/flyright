/** How far live flight lookup reaches. The provider's history follows our
 * AeroDataBox plan: Starter keeps 180 days and answers anything older with
 * a 400 ("must not be earlier than 180 day(s) ago"); Growth and up keep 365.
 * Change PROVIDER_HISTORY_DAYS with the plan. Schedules run ~11 months
 * forward. Shared by the add-flight calendar, document import and the
 * flight-status route, so the app never offers a day the server refuses. */

/** Days of flight history the current provider plan serves. */
export const PROVIDER_HISTORY_DAYS = 180;

/** Months ahead the provider has schedules for. */
export const LOOKUP_MONTHS_AHEAD = 11;

/** What the app says about that reach, in one place. */
export const LOOKUP_REACH_LABEL = 'about 6 months';

const DAY_MS = 86_400_000;

/** Whether the provider still holds `date` ('YYYY-MM-DD'). It counts back
 * from the current moment to the day's midnight, so the day exactly
 * PROVIDER_HISTORY_DAYS back is already gone. The server's check. */
export function providerHasDay(date: string, now: number = Date.now()): boolean {
  const midnight = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(midnight) && midnight > now - PROVIDER_HISTORY_DAYS * DAY_MS;
}

/** The oldest day the app offers for lookup, on the device's calendar. Two
 * days inside the provider's edge, so a traveller ahead of UTC never picks a
 * day the server has just let go of. */
export function oldestLookupDay(today: Date): Date {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - (PROVIDER_HISTORY_DAYS - 2));
}

/** The newest day the app offers for lookup. */
export function newestLookupDay(today: Date): Date {
  return new Date(today.getFullYear(), today.getMonth() + LOOKUP_MONTHS_AHEAD, today.getDate());
}

/** Whether a lookup for `date` ('YYYY-MM-DD') can find anything; outside
 * this a lookup is a guaranteed refusal, so callers skip the round trip. */
export function withinLookupReach(date: string, today: Date): boolean {
  const day = new Date(`${date}T00:00:00`);
  return day >= oldestLookupDay(today) && day <= newestLookupDay(today);
}
