import { extractItinerary } from './itinerary';

/** A real five-leg Finnair e-ticket receipt (Amadeus template), reduced to the
 * itinerary block. Three of its legs are codeshares: Finnair sells them,
 * British Airways and American Airlines fly them.
 *
 * The receipt prints the airline in four columns — `Operated by | <operator> |
 * Marketed by | <marketer>` — and the operator is the one EU261 asks about.
 * The text below is what the reader hands the parser once a page has been put
 * back into reading order (PDFBox's sortByPosition on Android, the glyph
 * banding in FlyRightDocumentImportModule.rowOrderedText on iOS). */
const RECEIPT = `Itinerary
From  To   Flight  Class  Date Departure Arrival Resa (1) NVB(2)  NVA(3)  Last check-in Baggage (4)  Seat
STOCKHOLM  LONDON  BA0777  O  28Nov 11:30  13:25  Ok  28Nov  28Nov   0PC
ARLANDA  HEATHROW
Terminal 2  Terminal 5   Fare Basis  OLN7T8BW/EUSI
Operated by  BRITISH AIRWAYS  Marketed by  BRITISH AIRWAYS
Frequent flyer number  711332957
_
LONDON  LAS VEGAS  AY5435  O  28Nov 16:05  18:50  Ok  28Nov  28Nov  15:20  0PC
HEATHROW  HARRY REID INTL
Terminal 5  Terminal 3   Fare Basis  OLN7T8BW/EUSI
Operated by  BRITISH AIRWAYS  Marketed by  FINNAIR
Frequent flyer number  711332957
_
LAS VEGAS  LOS ANGELES  AY4121  O  04Dec 12:00  13:20  Ok  04Dec  04Dec  10:45  0PC
HARRY REID INTLLOS ANGELES
INTL
Terminal 1  Terminal 0   Fare Basis  OLN7T8BW/EUSI
Operated by  AMERICAN AIRLINES  Marketed by  FINNAIR
Frequent flyer number  711332957
_
LOS ANGELES  HELSINKI  AY0002  O  04Dec 18:50  15:20  Ok  04Dec  04Dec  17:50  0PC
LOS ANGELES  HELSINKI
INTL  VANTAA
Terminal B  Fare Basis  OLN7T8BW/EUSI
Operated by  FINNAIR  Marketed by  FINNAIR
Frequent flyer number  711332957  Arrival Day+1
_
HELSINKI  STOCKHOLM  AY0815  O  05Dec 16:50  16:55  Ok  05Dec  05Dec  16:05  0PC
HELSINKI  ARLANDA
VANTAA
Terminal 2   Fare Basis  OLN7T8BW/EUSI
Operated by  FINNAIR  Marketed by  FINNAIR
Frequent flyer number  711332957
_
(1) Ok = confirmed (2) NVB = Not valid before (3) NVA = Not valid after (4)Each passenger can check in a specific amount of baggage at no extra cost as indicated
above in the column baggage.
Baggage Policy`;

/** Its single boarding-pass barcode, decoded from the PDF: one leg only, so
 * the other four have to come from the text. */
const BCBP = 'M1PADINJARECHALIL SH/SE9ITC7L ARNLHRBA 0777 332O000 0000 043>218   0000I                251052493891739';

const NOV = new Date('2026-09-05');

describe('a codeshare itinerary', () => {
  it('records the airline that flies each leg, not the one that sold it', () => {
    const { segments } = extractItinerary([{ text: RECEIPT, barcodes: [BCBP] }], NOV);

    expect(
      segments.map((s) => [s.flight, s.operatedBy?.code ?? null]),
    ).toEqual([
      ['BA777', 'BA'],
      ['AY5435', 'BA'],
      ['AY4121', 'AA'],
      ['AY2', 'AY'],
      ['AY815', 'AY'],
    ]);
  });

  it('keeps each leg on its own day', () => {
    const { segments } = extractItinerary([{ text: RECEIPT, barcodes: [BCBP] }], NOV);
    expect(segments.map((s) => s.date)).toEqual([
      '2026-11-28',
      '2026-11-28',
      '2026-12-04',
      '2026-12-04',
      '2026-12-05',
    ]);
  });

  /** Regression: PDFKit's page.string is content-stream order, which put the
   * operator's name on a line of its own and ran the "Operated by" label into
   * the next line entirely. The label must never reach across a line break for
   * its airline — that is how "Frequent flyer number" was once read as one.
   * (The inversion itself — a well-formed "Operated by FINNAIR" about a leg
   * British Airways flies — is not visible from here at all; it is prevented
   * upstream, by handing this parser text in reading order.) */
  it('never reads the operator off the following line', () => {
    const { segments } = extractItinerary([{ text: SCRAMBLED, barcodes: [BCBP] }], NOV);
    const leg = segments.find((s) => s.flight === 'AY5435');
    expect(leg?.operatedBy).toBeNull();
  });
});

/** The same leg as PDFKit's page.string once gave it: the label orphaned from
 * every airline name on the page. */
const SCRAMBLED = `Itinerary
From
To Flight
Class Date Departure Arrival Resa (1) NVB(2) NVA(3) Last check-in Baggage (4)
Seat
LONDON
HEATHROW
LAS VEGAS
HARRY REID INTL
AY5435 O 28Nov 16:05 18:50 Ok 28Nov 28Nov 15:20 0PC
Terminal 5 Terminal 3 Fare Basis OLN7T8BW/EUSI
BRITISH AIRWAYS
Operated by
Frequent flyer number 711332957
Marketed by
Frequent flyer number 711332957`;
