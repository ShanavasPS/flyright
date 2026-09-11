import {
  AA_RECEIPT_PDFBOX,
  AA_RECEIPT_PDFKIT,
  ALASKA_CONFIRMATION_PDFBOX,
  ALASKA_CONFIRMATION_PDFKIT,
  DELTA_CONFIRMATION_PDFBOX,
  EMIRATES_CONJUNCTION_PDFBOX,
  EMIRATES_CONJUNCTION_PDFKIT,
  EMIRATES_RECEIPT_PDFBOX,
  EMIRATES_RECEIPT_PDFKIT,
  ETIHAD_RECEIPT_PDFBOX,
  ETIHAD_RECEIPT_PDFKIT,
  GOIBIBO_CONFIRMATION_PDFBOX,
  GOIBIBO_CONFIRMATION_PDFKIT,
  INDIGO_EMAIL_SCREENSHOT,
  LUFTHANSA_CONFIRMATION_PDFBOX,
  LUFTHANSA_CONFIRMATION_PDFKIT,
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

/** What the reader makes of a document's text alone — all a code-less
 * document has, and the hardest layouts to parse. */
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

  it('keeps the printed year when the receipt is read months after the trip', () => {
    // 1 Mar 2027: for the BCBP's bare day 206, "closest to today" is
    // 25 Jul 2027 — a trip that hasn't happened. The page says 25Jul2026,
    // and the page knows the year; the code doesn't.
    const later = new Date(2027, 2, 1, 12);
    const { segments } = extractItinerary(QATAR_RECEIPT_PDFKIT, later);
    const qr517 = segments.find((s) => s.flight === 'QR517')!;
    expect(qr517.date).toBe('2026-07-25');
    expect(qr517.sources).toEqual(['barcode', 'text']);
    expect(segments.find((s) => s.flight === 'QR516')!.date).toBe('2026-08-02');
    expect(segments.find((s) => s.flight === 'QR516')!.arrivalDate).toBe('2026-08-03');
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
  // A booking confirmation emailed as a PDF, and most airlines' own e-ticket
  // receipts, carry no boarding-pass barcode. They are read from the page
  // alone: what the text reader finds is what the traveller gets to review.
  it.each([
    ['Delta', DELTA_CONFIRMATION_PDFKIT],
    ['Delta, PDFBox order', DELTA_CONFIRMATION_PDFBOX],
    ['Alaska', ALASKA_CONFIRMATION_PDFKIT],
    ['Alaska, PDFBox order', ALASKA_CONFIRMATION_PDFBOX],
    ['American', AA_RECEIPT_PDFKIT],
    ['American, PDFBox order', AA_RECEIPT_PDFBOX],
  ])('reads %s from the page alone', (_label, pages) => {
    const result = extractItinerary(pages, TODAY);
    expect(result.boardingPassBarcodes).toBe(0);
    expect(result.segments.map(shape)).toEqual(textOnly(pages));
    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.segments.every((s) => s.sources.join() === 'text')).toBe(true);
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
    // Its record-locator PDF417 is neither a boarding pass nor an e-ticket
    // record.
    const { boardingPassBarcodes, ticketNumbers } = extractItinerary(pages, TODAY);
    expect(boardingPassBarcodes).toBe(0);
    expect(ticketNumbers).toEqual([]);
  });
});

describe('extractItinerary — Emirates e-ticket receipt', () => {
  // Emirates' receipt prints an e-ticket record, not a boarding pass: the
  // stripe names the ticket and nothing about the flights, so every leg is
  // read from the page. Its leg table puts a check-in column before
  // departure, and heads each leg with its route as a sentence.
  const LEGS = [
    { flight: 'EK533', date: '2026-04-08', from: 'COK', to: 'DXB', dep: '04:30', arr: '06:50' },
    { flight: 'EK181', date: '2026-04-08', from: 'DXB', to: 'BRU', dep: '13:20', arr: '19:30' },
    { flight: 'AY1550', date: '2026-04-09', from: 'BRU', to: 'HEL', dep: '06:30', arr: '10:00' },
  ];

  it.each([
    ['PDFKit order', EMIRATES_RECEIPT_PDFKIT],
    ['PDFBox order', EMIRATES_RECEIPT_PDFBOX],
  ])('finds all three legs in %s, skipping the check-in clock', (_label, pages) => {
    expect(summary(pages)).toEqual(LEGS);
  });

  it('reads the ticket number off the stripe, and knows it is no boarding pass', () => {
    const { segments, boardingPassBarcodes, ticketNumbers } = extractItinerary(EMIRATES_RECEIPT_PDFKIT, TODAY);
    expect(boardingPassBarcodes).toBe(0);
    expect(ticketNumbers).toEqual(['176-2400000001']);
    expect(segments.every((s) => s.sources.join() === 'text')).toBe(true);
    expect(segments.every((s) => s.pnr === 'PLQWTZ')).toBe(true);
  });

  const CONJUNCTION_LEGS = [
    { flight: 'EK533', date: '2025-09-27', from: 'COK', to: 'DXB', dep: '04:25', arr: '06:50' },
    { flight: 'EK215', date: '2025-09-27', from: 'DXB', to: 'LAX', dep: '08:55', arr: '14:15' },
    { flight: 'EK222', date: '2025-10-11', from: 'DFW', to: 'DXB', dep: '12:15', arr: '12:00' },
    { flight: 'EK530', date: '2025-10-13', from: 'DXB', to: 'COK', dep: '03:20', arr: '08:55' },
  ];

  it.each([
    ['PDFKit order', EMIRATES_CONJUNCTION_PDFKIT],
    ['PDFBox order', EMIRATES_CONJUNCTION_PDFBOX],
  ])('finds all four legs of a conjunction ticket across two pages in %s', (_label, pages) => {
    expect(summary(pages)).toEqual(CONJUNCTION_LEGS);
  });

  it.each([
    ['PDFKit order', EMIRATES_CONJUNCTION_PDFKIT],
    ['PDFBox order', EMIRATES_CONJUNCTION_PDFBOX],
  ])('lands the overnight leg the next day and reads the seat column in %s', (_label, pages) => {
    const { segments, ticketNumbers } = extractItinerary(pages, TODAY);
    expect(ticketNumbers).toEqual(['176-2400000101']);
    expect(segments.find((s) => s.flight === 'EK222')!.arrivalDate).toBe('2025-10-12');
    expect(segments.map((s) => s.seat)).toEqual(['29K', '63K', '39H', '28H']);
    expect(segments.every((s) => s.pnr === 'RX4TQ7')).toBe(true);
  });
});

describe('extractItinerary — Etihad e-ticket receipt', () => {
  // No barcode anywhere. A summary strip prints the three legs' dates,
  // numbers and airports as three column-aligned rows before the per-leg
  // blocks — read in reading order, that is "06 Jun 06 Jun 07 Jun" (not a
  // date in 2006) over "AY 1305 EY 42 EY 332" — and each block prints the
  // previous leg's airports closer to the flight number than its own.
  const LEGS = [
    { flight: 'AY1305', date: '2026-06-06', from: 'HEL', to: 'AMS', dep: '16:40', arr: '18:15' },
    { flight: 'EY42', date: '2026-06-06', from: 'AMS', to: 'AUH', dep: '21:55', arr: '06:30' },
    { flight: 'EY332', date: '2026-06-07', from: 'AUH', to: 'COK', dep: '08:40', arr: '14:15' },
  ];

  it.each([
    ['PDFKit order', ETIHAD_RECEIPT_PDFKIT],
    ['PDFBox order', ETIHAD_RECEIPT_PDFBOX],
  ])('finds the three legs once each in %s', (_label, pages) => {
    expect(summary(pages)).toEqual(LEGS);
  });

  it.each([
    ['PDFKit order', ETIHAD_RECEIPT_PDFKIT],
    ['PDFBox order', ETIHAD_RECEIPT_PDFBOX],
  ])('reads seats, the overnight arrival and the airline reference in %s', (_label, pages) => {
    const { segments, boardingPassBarcodes, ticketNumbers } = extractItinerary(pages, TODAY);
    expect(boardingPassBarcodes).toBe(0);
    expect(ticketNumbers).toEqual([]);
    expect(segments.map((s) => s.seat)).toEqual([null, '21H', '9F']);
    expect(segments.find((s) => s.flight === 'EY42')!.arrivalDate).toBe('2026-06-07');
    expect(segments.every((s) => s.pnr === '3ZQTPV')).toBe(true);
  });
});

describe('extractItinerary — Goibibo booking confirmation', () => {
  // An Indian OTA's confirmation: no barcode, hyphenated IndiGo flight
  // numbers ("6E-6273"), the year printed only in the heading ("SUN, 11
  // OCT '20") with every clock dated "11 Oct" alone, and each leg headed by
  // its airport codes in big type over the city names — codes the page
  // never parenthesises or pairs with an arrow.
  const LEGS = [
    { flight: '6E6273', date: '2020-10-11', from: 'TRV', to: 'BLR', dep: '10:00', arr: '11:20' },
    { flight: '6E181', date: '2020-10-11', from: 'BLR', to: 'IXE', dep: '17:25', arr: '18:30' },
  ];

  it.each([
    ['PDFKit order', GOIBIBO_CONFIRMATION_PDFKIT],
    ['PDFBox order', GOIBIBO_CONFIRMATION_PDFBOX],
  ])('finds both legs, in the printed year, in %s', (_label, pages) => {
    // Read six years on: the nearest 11 October is a Sunday too, so only
    // the heading's '20 tells the legs apart from a trip this autumn.
    expect(summary(pages)).toEqual(LEGS);
  });

  it.each([
    ['PDFKit order', GOIBIBO_CONFIRMATION_PDFKIT],
    ['PDFBox order', GOIBIBO_CONFIRMATION_PDFBOX],
  ])('reads the PNR off its column and a seat per leg in %s', (_label, pages) => {
    const { segments, boardingPassBarcodes, ticketNumbers } = extractItinerary(pages, TODAY);
    expect(boardingPassBarcodes).toBe(0);
    expect(ticketNumbers).toEqual([]);
    expect(segments.map((s) => s.seat)).toEqual(['24A', '21A']);
    expect(segments.every((s) => s.pnr === '7QK2AB')).toBe(true);
    expect(segments.every((s) => s.arrivalDate === '2020-10-11')).toBe(true);
  });

  it('keeps the hyphen out of the flight number and the layover out of the clocks', () => {
    const [first] = extractSegmentsFromText(GOIBIBO_CONFIRMATION_PDFKIT[0].text, TODAY);
    expect(first.flight).toBe('6E6273');
    expect([first.depTime, first.arrTime]).toEqual(['10:00', '11:20']);
  });
});

describe('extractItinerary — a screenshot of an IndiGo itinerary email', () => {
  // OCR of a phone screenshot: the status bar and the booking stamp (with
  // seconds) are flight-shaped noise, the table's wrapped cells come out
  // band by band so neither the header words nor a row's three clocks
  // are in column order, "6E" reads as "SE" once (a real carrier, but not
  // one the page names), the aircraft column prints "(A320)", and the
  // year appears only as "04 Oct 20" with a city on the next line. The
  // header names a "Counter/Bag drop closes" column, so each row's three
  // clocks are told apart by value, and the routes are the chain listed
  // under the table.
  const TODAY_2026 = new Date(2026, 8, 11, 12);

  it('finds both legs, the printed year, and the right clocks around the closing column', () => {
    const { segments, boardingPassBarcodes } = extractItinerary(INDIGO_EMAIL_SCREENSHOT, TODAY_2026);
    expect(boardingPassBarcodes).toBe(0);
    expect(summary(INDIGO_EMAIL_SCREENSHOT, TODAY_2026)).toEqual([
      { flight: '6E388', date: '2020-10-04', from: 'IXE', to: 'BLR', dep: '13:40', arr: '14:45' },
      { flight: '6E379', date: '2020-10-04', from: 'BLR', to: 'TRV', dep: '16:10', arr: '17:30' },
    ]);
    expect(segments.every((s) => s.pnr === 'K7PQ2N' && s.arrivalDate === '2020-10-04')).toBe(true);
    // The seats are a table of their own under the legs, one per route.
    expect(segments.map((s) => s.seat)).toEqual(['20A', '20A']);
  });

  it('never makes a leg of the status bar, the booking stamp or the aircraft type', () => {
    const segments = extractSegmentsFromText(INDIGO_EMAIL_SCREENSHOT[0].text, TODAY_2026);
    expect(segments.map((s) => s.flight)).toEqual(['6E388', '6E379']);
    expect(segments.some((s) => s.date === '2020-09-25' || s.depTime === '16:25')).toBe(false);
  });
});

describe('extractItinerary — Lufthansa booking confirmation', () => {
  // No barcode. Each leg is headed "Sat. 06 February 2021: Bangalore –
  // Frankfurt" (a colon after the year), the first heading sits a whole
  // "Important Notice" paragraph above its row, the row prints the
  // departure clock BEFORE the flight number and the arrival on the next
  // line, and the second heading opens page two — nearer the first leg's
  // arrival than the second leg's own row, which read both legs as one.
  // Android's reader sets the numbers with a non-breaking space.
  const LEGS = [
    { flight: 'LH755', date: '2021-02-06', from: 'BLR', to: 'FRA', dep: '03:35', arr: '09:35' },
    { flight: 'LH848', date: '2021-02-06', from: 'FRA', to: 'HEL', dep: '10:45', arr: '14:10' },
  ];

  it.each([
    ['PDFKit order', LUFTHANSA_CONFIRMATION_PDFKIT],
    ['PDFBox order', LUFTHANSA_CONFIRMATION_PDFBOX],
  ])('finds both legs with their own clocks and the printed year in %s', (_label, pages) => {
    expect(summary(pages)).toEqual(LEGS);
    const { segments } = extractItinerary(pages, TODAY);
    expect(segments.every((s) => s.pnr === 'Q00ABC')).toBe(true);
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
