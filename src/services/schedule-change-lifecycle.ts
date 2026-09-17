/** Applying what schedule-change.ts decides: adopt the airline's new times,
 * keep the ticket's for the record, and tell the traveler once.
 *
 * Called from wherever a lookup already happens — the journey screen and the
 * background sweep — so noticing a re-time costs no extra provider calls.
 */

import { airportZone } from '@/services/airports';
import { flightDay, formatTime } from '@/services/dates';
import type { FlightStatus } from '@/services/flight-lookup';
import { toDomainJourney, updateJourney, type JourneyRow } from '@/services/journeys';
import { maybeNotifyScheduleChange } from '@/services/notification-lifecycle';
import { scheduleChange, type ScheduleChange } from '@/services/schedule-change';

/**
 * Reconcile one trip against what the airline currently publishes. Returns
 * the change when there was one, so callers can log it; does nothing at all
 * in the ordinary case where the ticket still stands.
 */
export async function applyScheduleChange(
  row: JourneyRow,
  status: FlightStatus,
  now = new Date(),
): Promise<ScheduleChange | null> {
  await rememberAircraft(row, status);
  const change = scheduleChange(row, status, now);
  if (!change) return null;

  await updateJourney(row.id, {
    scheduledDeparture: change.departure,
    scheduledArrival: change.arrival,
    // Only the first move records a "was" — after that the ticket's own times
    // are already saved, and overwriting them with the previous *revision*
    // would lose what the traveler actually booked.
    ticketedDeparture: row.ticketedDeparture ?? row.scheduledDeparture,
    ticketedArrival: row.ticketedArrival ?? row.scheduledArrival,
  });

  await maybeNotifyScheduleChange(
    toDomainJourney(row),
    change,
    formatTime(change.departure, airportZone(row.fromCode)),
  );
  return change;
}

/** The aircraft the provider now names for the flight, kept on the trip for
 * the aircraft section of Travel stats. Written whenever a lookup happens
 * anyway, so trips saved before the type was recorded — or before the
 * airline assigned one — fill in over time; the registration follows the
 * type, since a swap changes both. No-op when nothing new is known. */
export async function rememberAircraft(row: JourneyRow, status: FlightStatus): Promise<void> {
  const model = status.aircraft?.model?.trim() || null;
  if (!model) return;
  const reg = status.aircraft?.reg || null;
  if (row.aircraftModel === model && (row.aircraftReg ?? null) === reg) return;
  await updateJourney(row.id, { aircraftModel: model, aircraftReg: reg });
}

/** The day to ask the provider about: the flight's own local date at its
 * origin, not the UTC date of the instant we stored. See dates.flightDay. */
export function lookupDayFor(
  row: Pick<JourneyRow, 'scheduledDeparture' | 'fromCode'>,
): string {
  return flightDay(row.scheduledDeparture, airportZone(row.fromCode));
}
