/** Telling "the airline moved this flight" apart from "our data is stale".
 *
 * A trip is saved with the times its ticket printed, because that is what the
 * traveler booked and what they will be holding at the gate. Airlines do
 * re-time flights afterwards, though, and a countdown to a departure that no
 * longer exists is worse than no countdown at all — so every lookup the app
 * already makes gets read for one more thing: does the airline's current
 * published schedule still agree with the ticket?
 *
 * The trap is that a disagreement is not by itself news. The provider's
 * schedule for a flight months out is a database row that may be older than
 * the ticket in hand — the receipt that prompted all this was issued on 5
 * September against a BA777 record last revised on 20 August, so the
 * provider's "12:25" was the stale one and the ticket's "11:30" was current.
 * Adopting that would have been a regression dressed up as a feature.
 *
 * Hence the rule: a schedule change counts only when the provider revised its
 * record *after* we read the ticket. Then it is genuinely newer information
 * and worth acting on. Otherwise the ticket stands and nobody is told
 * anything.
 *
 * Pure — no DB, no notifications. schedule-change-lifecycle.ts applies what
 * this decides.
 */

import type { FlightStatus } from '@/services/flight-lookup';
import type { JourneyRow } from '@/services/journeys';

/** Only zoned timestamps are instants; a manual entry's bare wall clock has
 * no fixed meaning to compare against (see services/timeline blockMinutes). */
const ZONED = /(Z|[+-]\d\d:?\d\d)$/;

/** Published schedules move in five-minute steps, and a smaller difference is
 * rounding somewhere upstream rather than a decision anyone made. */
const MATERIAL_MINUTES = 5;

/** How close to departure the provider's record stops being a schedule-
 * database projection and starts being operational. Inside this window its
 * revision stamp is trusted even when it is missing, because that is where
 * a re-time actually costs the traveler their flight. */
const OPERATIONAL_WINDOW_MS = 36 * 3_600_000;

export interface ScheduleChange {
  /** The airline's current times, to adopt as the trip's schedule. */
  departure: string;
  arrival: string;
  /** Signed minutes moved, positive when the flight got later. */
  departureShiftMinutes: number;
  arrivalShiftMinutes: number;
}

export type ChangeCandidate = Pick<
  JourneyRow,
  'scheduledDeparture' | 'scheduledArrival' | 'createdAt' | 'source'
>;

function shiftMinutes(from: string, to: string): number | null {
  if (!ZONED.test(from) || !ZONED.test(to)) return null;
  const minutes = Math.round((Date.parse(to) - Date.parse(from)) / 60_000);
  return Number.isFinite(minutes) ? minutes : null;
}

/**
 * What the airline now says, when that outranks what the ticket said. Null
 * when nothing moved, when the move is immaterial, or when the provider's
 * answer is older news than the trip we already hold.
 */
export function scheduleChange(
  row: ChangeCandidate,
  status: Pick<FlightStatus, 'scheduledDeparture' | 'scheduledArrival' | 'scheduleUpdatedAt'>,
  now: Date,
): ScheduleChange | null {
  // Journal rows are the traveler's own record of a trip; nothing out there
  // gets to rewrite them.
  if (row.source !== 'lookup') return null;
  if (!status.scheduledDeparture || !status.scheduledArrival) return null;

  const departureShiftMinutes = shiftMinutes(row.scheduledDeparture, status.scheduledDeparture);
  const arrivalShiftMinutes = shiftMinutes(row.scheduledArrival, status.scheduledArrival);
  if (departureShiftMinutes === null || arrivalShiftMinutes === null) return null;
  if (
    Math.abs(departureShiftMinutes) < MATERIAL_MINUTES &&
    Math.abs(arrivalShiftMinutes) < MATERIAL_MINUTES
  ) {
    return null;
  }

  if (!newerThanTheTicket(row, status.scheduleUpdatedAt, now)) return null;

  return {
    departure: status.scheduledDeparture,
    arrival: status.scheduledArrival,
    departureShiftMinutes,
    arrivalShiftMinutes,
  };
}

/** Whether the provider's record is newer information than the trip we hold.
 * Without a revision stamp, only proximity to departure vouches for it. */
function newerThanTheTicket(
  row: ChangeCandidate,
  scheduleUpdatedAt: string | null | undefined,
  now: Date,
): boolean {
  const departure = Date.parse(row.scheduledDeparture);
  const operational =
    !Number.isNaN(departure) && departure - now.getTime() <= OPERATIONAL_WINDOW_MS;
  if (!scheduleUpdatedAt) return operational;

  const revised = Date.parse(scheduleUpdatedAt);
  const saved = Date.parse(row.createdAt);
  if (Number.isNaN(revised)) return operational;
  if (Number.isNaN(saved)) return true;
  return revised > saved || operational;
}

/** "moved 55 min later" / "moved 1 h 10 min earlier" — the shift in the words
 * a traveler would use, for the card and the push. */
export function shiftLabel(minutes: number): string {
  const direction = minutes >= 0 ? 'later' : 'earlier';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  const span = hours ? (rest ? `${hours} h ${rest} min` : `${hours} h`) : `${rest} min`;
  return `${span} ${direction}`;
}
