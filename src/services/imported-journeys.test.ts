import { importedJourneyPatch, matchingImportedJourney, matchingJourney, normalizedFlight } from './imported-journeys';
import type { JourneyRow, NewJourneyRow } from './journeys';
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

// The 2026-07-25 QR517 that reached production twice: once from a lookup
// (UTC, id `QR517-2026-07-25`) and once from the manual form (bare Kochi
// wall clock, id `QR517-COK-DOH-2026-07-25`). Two rows, so the Flights tab
// grew a second "India trip" header and a stay the other copy could not see.
const lookupCopy = { id: 'QR517-2026-07-25', mode: 'flight', number: 'QR517', fromCode: 'COK', toCode: 'DOH', scheduledDeparture: '2026-07-24T22:45Z', scheduledArrival: '2026-07-25T03:05Z', deletedAt: null, bookingReference: null, passCode: null } as JourneyRow;
const manualCopy = { id: 'QR517-COK-DOH-2026-07-25', mode: 'flight', number: 'QR517', fromCode: 'COK', toCode: 'DOH', scheduledDeparture: '2026-07-25T04:15:00', scheduledArrival: '2026-07-25T06:05:00' } as NewJourneyRow;

it('matches the two id formats for one flight, in either direction', () => {
  expect(matchingJourney(manualCopy, [lookupCopy])?.id).toBe('QR517-2026-07-25');
  expect(matchingJourney({ ...lookupCopy }, [{ ...manualCopy, deletedAt: null } as JourneyRow])?.id).toBe('QR517-COK-DOH-2026-07-25');
});
it('normalizes the number and reads the day in the origin airport zone', () => {
  expect(matchingJourney({ ...manualCopy, number: 'QR 0517' }, [lookupCopy])?.id).toBe('QR517-2026-07-25');
  // 22:45Z on the 24th is 04:15 in Kochi on the 25th — the same flight.
  expect(matchingJourney(manualCopy, [{ ...lookupCopy, scheduledDeparture: '2026-07-24T12:00:00Z' }])).toBeNull();
});
it('keeps genuinely different trips apart', () => {
  expect(matchingJourney(manualCopy, [{ ...lookupCopy, toCode: 'DXB' }])).toBeNull();
  expect(matchingJourney(manualCopy, [{ ...lookupCopy, number: 'QR518' }])).toBeNull();
  expect(matchingJourney(manualCopy, [{ ...lookupCopy, deletedAt: '2026-07-20' }])).toBeNull();
  expect(matchingJourney({ ...manualCopy, mode: 'train' }, [{ ...lookupCopy, mode: 'train' }])).toBeNull();
  expect(matchingJourney({ ...manualCopy, number: '' }, [{ ...lookupCopy, number: '' }])).toBeNull();
});
it('leaves a codeshare pair to the document matcher, which has the booking', () => {
  // AS686 and QR3387 are the same SEA-PDX metal; only a shared PNR proves it.
  const operating = { ...lookupCopy, id: 'AS686-2026-07-25', number: 'AS686', fromCode: 'SEA', toCode: 'PDX', scheduledDeparture: '2026-07-25T22:55Z' } as JourneyRow;
  const marketing = { ...manualCopy, id: 'QR3387-SEA-PDX-2026-07-25', number: 'QR3387', fromCode: 'SEA', toCode: 'PDX', scheduledDeparture: '2026-07-25T15:55:00' } as NewJourneyRow;
  expect(matchingJourney(marketing, [operating])).toBeNull();
});
