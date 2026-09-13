import { importedJourneyPatch, matchingImportedJourney, normalizedFlight } from './imported-journeys';
import type { JourneyRow } from './journeys';
import type { ImportedSegment } from './itinerary';

const code = 'M1LINDQVIST/MAJA      EFRX7YQ HELLHRAY 1331 257Y014A0042 100';
const segment = { flight: 'AY1331', date: '2026-09-14', fromCode: 'HEL', toCode: 'LHR', seat: '14A', pnr: 'FRX7YQ', depTime: null, arrTime: null, pass: { code, format: 'pdf417' } } as ImportedSegment;
const trip = { id: 'existing', mode: 'flight', number: 'AY 01331', fromCode: 'HEL', toCode: 'LHR', scheduledDeparture: '2026-09-13T22:30:00Z', scheduledArrival: '2026-09-14T03:00:00Z', bookingReference: 'FRX7YQ', seat: '12B', notes: 'Keep my notes', privateTrip: true, hiddenFromCircle: true, passCode: null, deletedAt: null } as JourneyRow;

it.each([['ay 01331', 'AY1331'], ['6E00388', '6E388'], ['FIN01331', 'FIN1331']])('normalizes %s', (value, expected) => expect(normalizedFlight(value)).toBe(expected));
it('matches the local departure date across UTC midnight, regardless of original row ID', () => {
  expect(matchingImportedJourney(segment, [trip])?.id).toBe('existing');
});
it('matches a codeshare by booking and full route, or fills an unnamed manual trip', () => {
  expect(matchingImportedJourney(segment, [{ ...trip, number: 'BA6031' }])?.id).toBe('existing');
  expect(matchingImportedJourney(segment, [{ ...trip, number: '', bookingReference: null }])?.id).toBe('existing');
});
it('does not attach a pass to another day, route, booking or deleted trip', () => {
  expect(matchingImportedJourney(segment, [{ ...trip, scheduledDeparture: '2026-09-15T12:00:00Z' }])).toBeNull();
  expect(matchingImportedJourney(segment, [{ ...trip, toCode: 'JFK' }])).toBeNull();
  expect(matchingImportedJourney(segment, [{ ...trip, number: 'AY1333', bookingReference: 'OTHER' }])).toBeNull();
  expect(matchingImportedJourney(segment, [{ ...trip, deletedAt: '2026-09-13' }])).toBeNull();
});
it('changes only new pass details and leaves journal, visibility, identity and missing schedule untouched', () => {
  const patch = importedJourneyPatch(segment, trip, 'now');
  expect(patch).toEqual({ seat: '14A', passCode: code, passFormat: 'pdf417', passCapturedAt: 'now' });
  expect({ ...trip, ...patch }).toMatchObject({ id: 'existing', notes: 'Keep my notes', privateTrip: true, hiddenFromCircle: true, scheduledDeparture: trip.scheduledDeparture });
});
it('updates changed seat with the same barcode and does nothing for an identical repeated share', () => {
  const saved = { ...trip, passCode: code, passFormat: 'pdf417', seat: '14A' };
  expect(importedJourneyPatch(segment, saved, 'now')).toEqual({});
  expect(importedJourneyPatch({ ...segment, seat: '16C' }, saved, 'now')).toEqual({ seat: '16C' });
});
it('updates only explicit document clocks and keeps booking/seat when absent', () => {
  const patch = importedJourneyPatch({ ...segment, seat: null, pnr: null, depTime: '13:30' }, trip, 'now');
  expect(patch.scheduledDeparture).toBe('2026-09-14T10:30:00.000Z');
  expect(patch.scheduledArrival).toBeUndefined();
  expect(patch.seat).toBeUndefined();
  expect(patch.bookingReference).toBeUndefined();
});

it('does not rewrite the same departure merely because its ISO formatting differs', () => {
  const patch = importedJourneyPatch({ ...segment, depTime: '08:00' }, { ...trip, scheduledDeparture: '2026-09-14T05:00Z' }, 'now');
  expect(patch.scheduledDeparture).toBeUndefined();
});
