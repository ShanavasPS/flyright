import { strToU8, zipSync } from 'fflate';
import { readWalletArchive, readWalletText } from './wallet-passes';
import { extractItinerary } from './itinerary';

const CODE = 'M1LINDQVIST/MAJA      EFRX7YQ HELLHRAY 1331 257Y014A0042 100';
const pass = (overrides = {}) => ({
  formatVersion: 1, relevantDate: '2024-09-13T10:00:00+03:00',
  boardingPass: { transitType: 'PKTransitTypeAir' },
  barcodes: [{ format: 'PKBarcodeFormatPDF417', message: CODE, messageEncoding: 'iso-8859-1' }],
  ...overrides,
});
const archive = (value: unknown) => zipSync({ 'pass.json': strToU8(JSON.stringify(value)), 'logo.png': new Uint8Array(20) });
const token = (value: unknown) => ['e30', Buffer.from(JSON.stringify(value)).toString('base64url'), 'test-signature'].join('.');

it('reads the original payload and format, anchored to the Wallet year instead of today', () => {
  const pages = readWalletArchive(archive(pass()));
  expect(pages[0].barcodes).toEqual([CODE]);
  expect(pages[0].barcodeFormats).toEqual(['pdf417']);
  const result = extractItinerary(pages, new Date('2026-09-13T12:00:00Z'));
  expect(result.segments).toHaveLength(1);
  expect(result.segments[0]).toMatchObject({ flight: 'AY1331', date: '2024-09-13', seat: '14A', pnr: 'FRX7YQ', pass: { code: CODE, format: 'pdf417' } });
});

it('reads legacy barcode and structured departure/arrival, not boarding time', () => {
  const pages = readWalletArchive(archive(pass({
    barcodes: undefined,
    barcode: { format: 'PKBarcodeFormatAztec', message: CODE },
    semantics: { currentDepartureDate: '2026-09-14T13:30:00+03:00', currentArrivalDate: '2026-09-14T14:40:00+01:00', departureAirportCode: 'HEL', destinationAirportCode: 'LHR' },
    boardingPass: { transitType: 'PKTransitTypeAir', auxiliaryFields: [{ key: 'seat', value: '16C' }, { key: 'boarding', value: '12:45' }] },
  })));
  expect(extractItinerary(pages).segments[0]).toMatchObject({ date: '2026-09-14', depTime: '13:30', arrTime: '14:40', seat: '16C', pass: { format: 'aztec' } });
});

it('handles a multi-pass bundle and deduplicates the same flight', () => {
  const bundle = zipSync({ 'one.pkpass': archive(pass()), 'two.pkpass': archive(pass()) });
  const pages = readWalletArchive(bundle);
  expect(pages).toHaveLength(2);
  expect(extractItinerary(pages).segments).toHaveLength(1);
});

it('refuses non-flight passes, missing barcodes, corrupt and oversized archives', () => {
  expect(() => readWalletArchive(archive(pass({ boardingPass: { transitType: 'PKTransitTypeTrain' } })))).toThrow('not an airline');
  expect(() => readWalletArchive(archive(pass({ barcodes: [] })))).toThrow('no supported');
  expect(() => readWalletArchive(strToU8('not a ZIP'))).toThrow();
  expect(() => readWalletArchive(archive(pass({ unused: 'x'.repeat(600_000) })))).toThrow('too large');
  expect(() => readWalletArchive(zipSync({ '../pass.json': strToU8(JSON.stringify(pass())) }))).toThrow('not a readable');
});

it('reads a Google save link when its embedded object contains the barcode', () => {
  const jwt = { aud: 'google', typ: 'savetowallet', payload: {
    flightClasses: [{ id: 'flight', localScheduledDepartureDateTime: '2026-09-14T13:30:00', origin: { airportIataCode: 'HEL' }, destination: { airportIataCode: 'LHR' } }],
    flightObjects: [{ classId: 'flight', barcode: { type: 'PDF_417', value: CODE }, reservationInfo: { confirmationCode: 'FRX7YQ' } }],
  } };
  const pages = readWalletText(`My pass: https://pay.google.com/gp/v/save/${token(jwt)}`);
  expect(extractItinerary(pages).segments[0]).toMatchObject({ date: '2026-09-14', depTime: '13:30', pass: { code: CODE } });
});

it('does not fetch opaque, private, malformed or unrelated links', () => {
  for (const text of ['https://wallet.google.com/share/opaque', 'https://pay.google.com/gp/v/save/id-only', 'https://attacker.test/pass', 'file:///private/pass']) {
    expect(() => readWalletText(text)).toThrow('Share a screenshot');
  }
  expect(() => readWalletText(`https://pay.google.com/gp/v/save/${token({ aud: 'google', typ: 'savetowallet', payload: { flightObjects: [{ id: 'private' }] } })}`)).toThrow('Share a screenshot');
});

it('does not retain a changing barcode as a static boarding pass', () => {
  expect(() => readWalletText(`https://pay.google.com/gp/v/save/${token({ aud: 'google', typ: 'savetowallet', payload: { flightObjects: [{ barcode: { type: 'QR_CODE', value: CODE }, rotatingBarcode: {} }] } })}`)).toThrow('changing barcode');
});
