/** Shared-document matching and patches are pure so every import path uses
 * the same identity rules without replacing the traveller's journal. */
import { airportZone } from '@/services/airports';
import { flightDay } from '@/services/dates';
import type { ImportedSegment } from '@/services/itinerary';
import type { JourneyRow, NewJourneyRow } from '@/services/journeys';
import { legSchedule } from '@/services/leg-schedule';

export function normalizedFlight(value: string | null | undefined): string {
  const compact = (value ?? '').toUpperCase().replace(/\s/g, '');
  const match = compact.match(/^([A-Z]{3}|[A-Z\d]{2})0*(\d+[A-Z]?)$/);
  return match ? `${match[1]}${match[2]}` : compact;
}

/** What actually identifies a flight in the journal. `journeys.id` does not:
 * a lookup mints `QR517-2026-07-25` and the manual form
 * `QR517-COK-DOH-2026-07-25` for the same flight, so an id-only upsert saved
 * it twice and the trip then appeared under two headers, one of them with a
 * stay the other could not see. */
export type JourneyIdentity = Pick<
  NewJourneyRow,
  'mode' | 'number' | 'fromCode' | 'toCode' | 'scheduledDeparture'
>;

/** The journal row `candidate` is another copy of: same route, same
 * origin-local departure day, same flight number. Numbers are normalized
 * ('QR 0517' → 'QR517') and the day is read in the origin airport's zone, so
 * the two id formats above — and a UTC row against a bare wall-clock one —
 * still land on one trip.
 *
 * Deliberately strict. A codeshare held under the marketing number on one
 * copy and the operating number on the other is NOT matched here: telling
 * those apart from two genuinely different flights needs the shared booking
 * reference that only a document carries, which is `matchingImportedJourney`
 * below. */
export function matchingJourney(candidate: JourneyIdentity, rows: JourneyRow[]): JourneyRow | null {
  if (candidate.mode !== 'flight') return null;
  const number = normalizedFlight(candidate.number);
  if (!number) return null;
  const day = flightDay(candidate.scheduledDeparture, airportZone(candidate.fromCode));
  return (
    rows.find(
      row =>
        row.mode === 'flight' &&
        !row.deletedAt &&
        row.fromCode === candidate.fromCode &&
        row.toCode === candidate.toCode &&
        normalizedFlight(row.number) === number &&
        flightDay(row.scheduledDeparture, airportZone(row.fromCode)) === day,
    ) ?? null
  );
}

export function matchingImportedJourney(segment: ImportedSegment, rows: JourneyRow[]): JourneyRow | null {
  if (!segment.date) return null;
  const candidates = rows.filter(row => row.mode === 'flight' && !row.deletedAt &&
    flightDay(row.scheduledDeparture, airportZone(row.fromCode)) === segment.date &&
    (!segment.fromCode || row.fromCode === segment.fromCode) && (!segment.toCode || row.toCode === segment.toCode));
  const exact = candidates.filter(row => normalizedFlight(row.number) && normalizedFlight(row.number) === normalizedFlight(segment.flight));
  if (exact.length) return exact.find(row => row.passCode === segment.pass?.code) ?? exact[0];
  // A receipt can use the marketing number while the pass uses the operator.
  // Require the same booking and full route, or a journal entry with no number.
  if (!segment.fromCode || !segment.toCode) return null;
  const alternate = candidates.filter(row => !row.number || (!!segment.pnr && !!row.bookingReference && row.bookingReference.toUpperCase() === segment.pnr.toUpperCase()));
  return alternate.length === 1 ? alternate[0] : null;
}

export function importedJourneyPatch(segment: ImportedSegment, row: JourneyRow, now: string): Partial<NewJourneyRow> {
  const patch: Partial<NewJourneyRow> = {};
  const seat = segment.seat?.trim();
  const booking = segment.pnr?.trim();
  if (seat && seat !== row.seat) patch.seat = seat;
  if (booking && booking !== row.bookingReference) patch.bookingReference = booking;
  if (!row.number && segment.flight) patch.number = segment.flight;
  if (segment.pass && (segment.pass.code !== row.passCode || segment.pass.format !== row.passFormat)) {
    Object.assign(patch, { passCode: segment.pass.code, passFormat: segment.pass.format, passCapturedAt: now });
  }
  if (segment.ticket && (segment.ticket.code !== row.ticketCode || segment.ticket.format !== row.ticketFormat)) {
    Object.assign(patch, { ticketCode: segment.ticket.code, ticketFormat: segment.ticket.format, ticketCapturedAt: now });
  }
  // Only clocks actually supplied by this document can update the schedule.
  // A live lookup or an estimated placeholder must not overwrite this trip.
  const schedule = legSchedule({ ...segment, fromCode: row.fromCode, toCode: row.toCode }, null);
  const sameInstant = (a: string, b: string) => a === b || (Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b));
  if (schedule.departure && !sameInstant(schedule.departure, row.scheduledDeparture)) patch.scheduledDeparture = schedule.departure;
  if (schedule.arrival && !sameInstant(schedule.arrival, row.scheduledArrival)) patch.scheduledArrival = schedule.arrival;
  return patch;
}
