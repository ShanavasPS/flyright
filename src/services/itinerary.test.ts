import {
  AA_RECEIPT_PDFBOX,
  AA_RECEIPT_PDFKIT,
  ALASKA_CONFIRMATION_PDFBOX,
  ALASKA_CONFIRMATION_PDFKIT,
  DELTA_CONFIRMATION_PDFBOX,
  FINNAIR_RECEIPT,
  DELTA_CONFIRMATION_PDFKIT,
  QATAR_RECEIPT_PDFBOX,
  QATAR_RECEIPT_PDFKIT,
  QATAR_RECEIPT_PHOTO,
} from './__fixtures__/itinerary-documents';
import { extractItinerary, extractSegmentsFromText } from './itinerary';

// Every fixture was shared in the season it describes.
const TODAY = new Date(2026, 8, 4, 12); // 4 Sep 2026

const shape = (s: {
  flight: string | null;
  date: string | null;
  fromCode: string | null;
  toCode: string | null;
  depTime: string | null;
  arrTime: string | null;
}) => ({
  flight: s.flight,
  date: s.date,
  from: s.fromCode,
  to: s.toCode,
  dep: s.depTime,
  arr: s.arrTime,
});

/** What the reader makes of a code-less document's text. The app refuses
 * these files (extractItinerary → 'no-barcode'), but their layouts are the
 * hardest ones to parse, so they stay covered here. */
const textOnly = (pages: { text: string }[], today = TODAY) =>
  extractSegmentsFromText(pages.map((p) => p.text).join('\n'), today).map(shape);

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

  it.each([
    ['PDFKit', QATAR_RECEIPT_PDFKIT],
    ['PDFBox', QATAR_RECEIPT_PDFBOX],
  ])('names the operating airline on codeshare legs (%s)', (_label, pages) => {
    const { segments } = extractItinerary(pages, TODAY);
    const by = (flight: string) => segments.find((s) => s.flight === flight)!.operatedBy;
    // "Operated by: ALASKA" / "HORIZON AIR AS ALASKAHORIZON" under Qatar-sold
    // numbers — Horizon flies as Alaska, so the brand is Alaska on both.
    expect(by('QR3387')).toEqual({ code: 'AS', name: 'Alaska Airlines' });
    expect(by('QR2175')).toEqual({ code: 'AS', name: 'Alaska Airlines' });
    // Qatar's own legs name Qatar — the caller decides that's not a codeshare.
    expect(by('QR517')).toEqual({ code: 'QR', name: 'Qatar Airways' });
    expect(by('QR516')).toEqual({ code: 'QR', name: 'Qatar Airways' });
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

describe('extractItinerary — Finnair receipt, five legs behind one barcode', () => {
  it('dates every leg from the calendar, not from the clock beside it', () => {
    expect(summary(FINNAIR_RECEIPT)).toEqual([
      { flight: 'BA777', date: '2026-11-28', from: 'ARN', to: 'LHR', dep: '11:30', arr: '13:25' },
      { flight: 'AY5435', date: '2026-11-28', from: 'LHR', to: 'LAS', dep: '16:05', arr: '18:50' },
      { flight: 'AY4121', date: '2026-12-04', from: 'LAS', to: 'LAX', dep: '12:00', arr: '13:20' },
      { flight: 'AY2', date: '2026-12-04', from: 'LAX', to: 'HEL', dep: '18:50', arr: '15:20' },
      { flight: 'AY815', date: '2026-12-05', from: 'HEL', to: 'ARN', dep: '16:50', arr: '16:55' },
    ]);
  });

  it('takes the first leg from the code and the rest from the page', () => {
    const { segments, boardingPassBarcodes } = extractItinerary(FINNAIR_RECEIPT, TODAY);
    expect(boardingPassBarcodes).toBe(1);
    const [first] = segments;
    expect(first.sources).toEqual(['barcode', 'text']);
    expect(first.pnr).toBe('9ITC7L');
    expect(segments.slice(1).every((s) => s.sources.join() === 'text')).toBe(true);
    // The overnight hop keeps the day the page gives it.
    expect(segments.find((s) => s.flight === 'AY2')!.arrivalDate).toBe('2026-12-05');
  });
});

describe('extractItinerary — documents with no boarding-pass code', () => {
  // A ticket and a boarding pass carry a barcode; a booking confirmation
  // emailed as a PDF often doesn't. Those are refused rather than read from
  // the page alone — the page is a layout to guess at, and the guesses fail
  // silently. The layouts still have to parse (textOnly), so the reader
  // keeps its coverage either way.
  it.each([
    ['Delta', DELTA_CONFIRMATION_PDFKIT],
    ['Delta, PDFBox order', DELTA_CONFIRMATION_PDFBOX],
    ['Alaska', ALASKA_CONFIRMATION_PDFKIT],
    ['Alaska, PDFBox order', ALASKA_CONFIRMATION_PDFBOX],
    ['American', AA_RECEIPT_PDFKIT],
    ['American, PDFBox order', AA_RECEIPT_PDFBOX],
  ])('refuses %s', (_label, pages) => {
    const result = extractItinerary(pages, TODAY);
    expect(result.rejected).toBe('no-barcode');
    expect(result.segments).toEqual([]);
  });

  it.each([
    ['PDFKit', DELTA_CONFIRMATION_PDFKIT],
    ['PDFBox', DELTA_CONFIRMATION_PDFBOX],
  ])('Delta: resolves a weekday date without a year (%s)', (_label, pages) => {
    // "Wed, Oct 1": Wednesday rules out 2026 (a Thursday) even though it is nearer.
    expect(textOnly(pages)).toEqual([
      { flight: 'DL1559', date: '2025-10-01', from: 'LAX', to: 'SFO', dep: '16:00', arr: '17:18' },
    ]);
  });

  it.each([
    ['PDFKit', ALASKA_CONFIRMATION_PDFKIT],
    ['PDFBox', ALASKA_CONFIRMATION_PDFBOX],
  ])('Alaska: spaced designator, 12-hour clocks, cities as airports (%s)', (_label, pages) => {
    expect(textOnly(pages)).toEqual([
      { flight: 'AS774', date: '2025-10-04', from: 'SFO', to: 'LAS', dep: '15:51', arr: '17:33' },
    ]);
  });

  it.each([
    ['PDFKit', AA_RECEIPT_PDFKIT],
    ['PDFBox', AA_RECEIPT_PDFBOX],
  ])('American: airline name plus a bare flight number (%s)', (_label, pages) => {
    expect(textOnly(pages)).toEqual([
      { flight: 'AA3018', date: '2025-10-08', from: 'LAS', to: 'DFW', dep: '23:59', arr: '04:34' },
    ]);
    // Its record-locator PDF417 is not a boarding pass, so it doesn't rescue
    // the document either.
    expect(extractItinerary(pages, TODAY).boardingPassBarcodes).toBe(0);
  });
});

describe('extractItinerary — a picture of a document', () => {
  // The upload path (a screenshot or a photo, read by the platform text
  // recogniser) is noisier than a PDF: 'l' comes back as '|', and a cell read
  // in visual order can put an arrival before its departure. Every leg the
  // page names should still land, on the right day and route.
  it('reads the legs off a photographed receipt page', () => {
    expect(summary(QATAR_RECEIPT_PHOTO)).toEqual([
      // The one clock pair the recogniser hands over reversed — the times are
      // saved as printed, and a lookup overrides them for anyone signed in.
      { flight: 'QR517', date: '2026-07-25', from: 'COK', to: 'DOH', dep: '06:05', arr: '04:15' },
      { flight: 'QR719', date: '2026-07-25', from: 'DOH', to: 'SEA', dep: '07:50', arr: '12:25' },
      { flight: 'QR3387', date: '2026-07-25', from: 'SEA', to: 'PDX', dep: '15:55', arr: '16:55' },
      { flight: 'QR2175', date: '2026-08-01', from: 'PDX', to: 'SEA', dep: '13:48', arr: '14:43' },
    ]);
  });

  it('still merges the boarding-pass barcode into its leg', () => {
    const { segments, boardingPassBarcodes } = extractItinerary(QATAR_RECEIPT_PHOTO, TODAY);
    expect(boardingPassBarcodes).toBe(1);
    const first = segments[0];
    expect(first.sources).toContain('barcode');
    expect(first.pnr).toBe('7K2ABC');
    expect(first.seat).toBe('3K');
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
      operatedBy: null,
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
