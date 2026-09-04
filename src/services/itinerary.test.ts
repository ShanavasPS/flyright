import {
  AA_RECEIPT_PDFBOX,
  AA_RECEIPT_PDFKIT,
  ALASKA_CONFIRMATION_PDFBOX,
  ALASKA_CONFIRMATION_PDFKIT,
  DELTA_CONFIRMATION_PDFBOX,
  DELTA_CONFIRMATION_PDFKIT,
  QATAR_RECEIPT_PDFBOX,
  QATAR_RECEIPT_PDFKIT,
} from './__fixtures__/itinerary-documents';
import { extractItinerary } from './itinerary';

// Every fixture was shared in the season it describes.
const TODAY = new Date(2026, 8, 4, 12); // 4 Sep 2026

const summary = (pages: Parameters<typeof extractItinerary>[0], today = TODAY) =>
  extractItinerary(pages, today).segments.map((s) => ({
    flight: s.flight,
    date: s.date,
    from: s.fromCode,
    to: s.toCode,
    dep: s.depTime,
    arr: s.arrTime,
  }));

const QATAR_LEGS = [
  { flight: 'QR517', date: '2026-07-25', from: 'COK', to: 'DOH', dep: '04:15', arr: '06:05' },
  { flight: 'QR719', date: '2026-07-25', from: 'DOH', to: 'SEA', dep: '07:50', arr: '12:25' },
  { flight: 'QR3387', date: '2026-07-25', from: 'SEA', to: 'PDX', dep: '15:55', arr: '16:55' },
  { flight: 'QR2175', date: '2026-08-01', from: 'PDX', to: 'SEA', dep: '13:48', arr: '14:43' },
  { flight: 'QR720', date: '2026-08-01', from: 'SEA', to: 'DOH', dep: '16:25', arr: '17:00' },
  { flight: 'QR516', date: '2026-08-02', from: 'DOH', to: 'COK', dep: '19:40', arr: '02:45' },
];

describe('extractItinerary — Amadeus e-ticket receipt', () => {
  it.each([
    ['PDFKit order', QATAR_RECEIPT_PDFKIT],
    ['PDFBox order', QATAR_RECEIPT_PDFBOX],
  ])('finds all six legs in %s', (_label, pages) => {
    expect(summary(pages)).toEqual(QATAR_LEGS);
  });

  it('merges the BCBP stripes into the legs they belong to', () => {
    const { segments, boardingPassBarcodes } = extractItinerary(QATAR_RECEIPT_PDFKIT, TODAY);
    expect(boardingPassBarcodes).toBe(2);
    const qr517 = segments.find((s) => s.flight === 'QR517')!;
    expect(qr517.sources).toEqual(['barcode', 'text']);
    expect(qr517.seat).toBe('3K');
    expect(qr517.pnr).toBe('7K2ABC');
    const qr516 = segments.find((s) => s.flight === 'QR516')!;
    expect(qr516.sources).toEqual(['barcode', 'text']);
    expect(qr516.seat).toBe('2K');
    // Text-only legs still carry the document's booking reference and seat.
    const qr719 = segments.find((s) => s.flight === 'QR719')!;
    expect(qr719.sources).toEqual(['text']);
    expect(qr719.pnr).toBe('7K2ABC');
    expect(qr719.seat).toBe('6J');
    // No seat printed for the Alaska-operated hop — not the previous leg's.
    expect(segments.find((s) => s.flight === 'QR3387')!.seat).toBeNull();
  });

  it('reads printed arrival days, including overnight legs', () => {
    const { segments } = extractItinerary(QATAR_RECEIPT_PDFBOX, TODAY);
    expect(segments.find((s) => s.flight === 'QR720')!.arrivalDate).toBe('2026-08-02');
    expect(segments.find((s) => s.flight === 'QR516')!.arrivalDate).toBe('2026-08-03');
    expect(segments.find((s) => s.flight === 'QR517')!.arrivalDate).toBe('2026-07-25');
  });

  it('ignores the issue date, validity dates and durations', () => {
    const { segments } = extractItinerary(QATAR_RECEIPT_PDFKIT, TODAY);
    const dates = segments.map((s) => s.date);
    expect(dates).not.toContain('2026-06-11'); // Date: 11Jun2026
    expect(dates).not.toContain('2027-01-25'); // NVA
    expect(dates).not.toContain('2026-07-28'); // NVB
    expect(segments.map((s) => s.arrTime)).not.toContain('04:20'); // Duration
  });
});

describe('extractItinerary — booking confirmations', () => {
  it.each([
    ['PDFKit', DELTA_CONFIRMATION_PDFKIT],
    ['PDFBox', DELTA_CONFIRMATION_PDFBOX],
  ])('Delta: resolves a weekday date without a year (%s)', (_label, pages) => {
    // "Wed, Oct 1": Wednesday rules out 2026 (a Thursday) even though it is nearer.
    expect(summary(pages)).toEqual([
      { flight: 'DL1559', date: '2025-10-01', from: 'LAX', to: 'SFO', dep: '16:00', arr: '17:18' },
    ]);
    const [leg] = extractItinerary(pages, TODAY).segments;
    expect(leg.pnr).toBe('ABCDEF');
    expect(leg.arrivalDate).toBe('2025-10-01');
  });

  it.each([
    ['PDFKit', ALASKA_CONFIRMATION_PDFKIT],
    ['PDFBox', ALASKA_CONFIRMATION_PDFBOX],
  ])('Alaska: spaced designator, 12-hour clocks, cities as airports (%s)', (_label, pages) => {
    expect(summary(pages)).toEqual([
      { flight: 'AS774', date: '2025-10-04', from: 'SFO', to: 'LAS', dep: '15:51', arr: '17:33' },
    ]);
    expect(extractItinerary(pages, TODAY).segments[0].pnr).toBe('GHJKLM');
  });

  it.each([
    ['PDFKit', AA_RECEIPT_PDFKIT],
    ['PDFBox', AA_RECEIPT_PDFBOX],
  ])('American: airline name plus a bare flight number (%s)', (_label, pages) => {
    expect(summary(pages)).toEqual([
      { flight: 'AA3018', date: '2025-10-08', from: 'LAS', to: 'DFW', dep: '23:59', arr: '04:34' },
    ]);
    const [leg] = extractItinerary(pages, TODAY).segments;
    expect(leg.arrivalDate).toBe('2025-10-09');
    expect(leg.pnr).toBe('PQRSTU');
    expect(leg.seat).toBe('18F');
    // The record-locator PDF417 is not a boarding pass.
    expect(extractItinerary(pages, TODAY).boardingPassBarcodes).toBe(0);
  });
});

describe('extractItinerary — barcodes alone', () => {
  it('turns a boarding-pass barcode into a leg dated by day-of-year', () => {
    const { segments } = extractItinerary(
      [{ text: '', barcodes: ['M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100'] }],
      new Date(2026, 10, 20, 12),
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      flight: 'AC834',
      date: '2026-11-22',
      arrivalDate: '2026-11-22',
      fromCode: 'YUL',
      toCode: 'FRA',
      pnr: 'ABC123',
      seat: '1A',
      sources: ['barcode'],
    });
  });

  it('returns nothing for documents without flights', () => {
    const { segments } = extractItinerary(
      [{ text: 'Hotel booking\nCheck-in 12 Oct 2025 15:00\nCheck-out 14 Oct 2025 11:00\nTotal EUR 240', barcodes: [] }],
      TODAY,
    );
    expect(segments).toEqual([]);
  });

  it('does not mistake aircraft types or prices for flights', () => {
    const { segments } = extractItinerary(
      [
        {
          text: 'Aircraft: Airbus A321 · Boeing 737\nFare $ 214 on 8 Oct 2025\nSeat 12A',
          barcodes: [],
        },
      ],
      TODAY,
    );
    expect(segments).toEqual([]);
  });
});
