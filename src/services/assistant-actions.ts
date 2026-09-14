import { airportZone } from '@/services/airports';
import { asPassFormat } from '@/services/boarding-pass';
import { flightInstant } from '@/services/dates';
import type { JourneyRow } from '@/services/journeys';

export type AssistantAction = 'next-flight' | 'boarding-pass' | 'add-flight';

export function isAssistantAction(value: unknown): value is AssistantAction {
  return value === 'next-flight' || value === 'boarding-pass' || value === 'add-flight';
}

/** Resolve inside the app after auth and SQLite have loaded. Neither assistant
 * receives trip IDs, booking references, or barcode data. Recheck ownership even
 * though useJourneys scopes its query, so stale rows cannot cross an account switch.
 * Keep an airborne flight until its scheduled arrival, just like the journal. */
export function nextAssistantFlight(rows: JourneyRow[], userId: string | null | undefined, now = Date.now()) {
  return rows
    .filter(row => row.mode === 'flight' && !row.deletedAt && (!row.userId || row.userId === userId))
    .map(row => ({
      row,
      departure: flightInstant(row.scheduledDeparture, airportZone(row.fromCode)),
      arrival: flightInstant(row.scheduledArrival, airportZone(row.toCode)),
    }))
    .filter(({ departure, arrival }) => Number.isFinite(departure)
      && (departure >= now || (Number.isFinite(arrival) && arrival > departure && arrival > now)))
    .sort((a, b) => a.departure - b.departure || a.row.id.localeCompare(b.row.id))[0]?.row;
}

export function hasAssistantBoardingPass(row: JourneyRow) {
  return !!row.passCode?.trim() && asPassFormat(row.passFormat) !== null;
}
