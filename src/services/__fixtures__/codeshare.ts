import type { ImportedSegment } from '../itinerary';
import type { JourneyRow } from '../journeys';

// Synthetic ticket and later operating boarding pass, with different locators.
export const CODESHARE_PASS = 'M1DOE/JOHNMR          EASPNR1 SEAPDXAS 0686 206Y002A0042 100';
export const CODESHARE_TRIP = {
  id: 'qatar-leg', userId: 'traveller', mode: 'flight', number: 'QR3387',
  fromCode: 'SEA', toCode: 'PDX', scheduledDeparture: '2026-07-25T22:55:00Z',
  scheduledArrival: '2026-07-25T23:55:00Z', carrier: 'Alaska Airlines',
  bookingReference: 'QRPNR1', seat: null, passCode: null, deletedAt: null,
  notes: 'Keep my journal', privateTrip: true, hiddenFromCircle: true,
} as JourneyRow;
export const CODESHARE_SEGMENT: ImportedSegment = {
  key: 'AS686-2026-07-25', flight: 'AS686', date: '2026-07-25',
  fromCode: 'SEA', toCode: 'PDX', pnr: 'ASPNR1', seat: '2A',
  pass: { code: CODESHARE_PASS, format: 'pdf417' }, sources: ['barcode'],
  arrivalDate: null, depTime: null, arrTime: null, operatedBy: null,
};
