/** Pure itinerary extraction from a travel document — no platform APIs, fully
 * unit-testable. The native side (modules/flyright-document-import) turns a
 * shared PDF into per-page text plus decoded barcodes; this file turns that
 * into flight segments the import screen can look up and save.
 *
 * Two sources, merged:
 *
 *  - Barcodes. Boarding passes carry an IATA BCBP record (parseBcbp), and so
 *    do the PDF417 stripes on Amadeus e-ticket receipts — route, flight,
 *    seat, and a day-of-year, but no year. Other receipts (Emirates) print
 *    an e-ticket record instead (parseEticketRecord): the ticket number and
 *    nothing about the flights. Many (Etihad) print no code at all.
 *  - Text. Receipts and booking confirmations spell every leg out in prose,
 *    each in a different layout. Flight designators (QR517, "AS 774") anchor
 *    a segment; the nearest dates, times, and airports around each anchor
 *    fill it in.
 *
 * Text order differs by platform (PDFKit walks the content stream, PDFBox
 * sorts by position), so nothing here depends on line structure: everything
 * is proximity to the anchor within a bounded window.
 */

import { CARRIERS, operatingBrand } from '@/constants/carriers';
import { airportRank, hubAirports, isValidIata } from '@/services/airports';
import { parseBcbp, resolveFlightDate } from '@/services/bcbp';
import { parseEticketRecord } from '@/services/eticket';

export interface DocumentPage {
  text: string;
  /** Raw payloads of every barcode decoded on the page. */
  barcodes: string[];
}

export type SegmentSource = 'barcode' | 'text';

export interface ImportedSegment {
  /** Stable key for list rendering / selection. */
  key: string;
  /** Normalized designator ("AS774"), or null for a leg found without one. */
  flight: string | null;
  /** Departure day, 'YYYY-MM-DD'. Null only when no date could be tied to the leg. */
  date: string | null;
  arrivalDate: string | null;
  /** Local clock times 'HH:mm' as printed, or null. */
  depTime: string | null;
  arrTime: string | null;
  fromCode: string | null;
  toCode: string | null;
  pnr: string | null;
  seat: string | null;
  /** The airline the passenger flies with when the document's disclosure
   * line says so ("Operated by: HORIZON AIR AS ALASKAHORIZON" on a Qatar-sold
   * ticket → Alaska Airlines): the brand, not the regional's corporate name.
   * `code` is null when the name isn't in the carrier table; `name` is the
   * table's spelling when it is, the document's otherwise. Null when the
   * document is silent. */
  operatedBy: { code: string | null; name: string } | null;
  sources: SegmentSource[];
}

export interface ItineraryExtraction {
  segments: ImportedSegment[];
  /** How many decoded barcodes parsed as boarding passes. */
  boardingPassBarcodes: number;
  /** Ticket numbers ("176-2400000001") read off e-ticket record barcodes,
   * each once. Provenance only — the record names no flight. */
  ticketNumbers: string[];
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

interface Mark<T> {
  index: number;
  end: number;
  value: T;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const WEEKDAYS: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/** Two-letter prefixes that read as flight designators but are everyday
 * words or units ("AT 12", "NO 3", "2 PC", "US 2234"). Real carriers sharing
 * a code (e.g. PC Pegasus) are sacrificed — receipts print them with the
 * airline name nearby anyway, and the barcode path is unaffected. */
const NOT_AN_AIRLINE = new Set([
  'AM', 'PM', 'NO', 'ON', 'IN', 'AT', 'TO', 'OF', 'OR', 'BY', 'US', 'UK', 'EU',
  'KG', 'LB', 'PC', 'CM', 'MM', 'KM', 'MI', 'GB', 'MB', 'ID', 'TV', 'HD', 'PO',
  'RM', 'ST', 'ND', 'RD', 'TH', 'HR', 'HH', 'MN', 'SS', 'TS', 'PP', 'PG', 'CC',
  'DE', 'LA', 'EL', 'IT', 'IS', 'AS', 'BE', 'DO', 'GO', 'IF', 'SO', 'UP', 'WE',
]);
// Carriers in the known table that double as words (AS Alaska, DE Condor,
// LA LATAM) stay recognisable when followed by a real-length flight number:
// "AS 774" is a flight, "AS 2" is prose.

/** Aircraft types ("Airbus A321", "Boeing 737") look like designators. */
const AIRCRAFT_CONTEXT = /(AIRBUS|BOEING|EMBRAER|BOMBARDIER|AIRCRAFT|EQUIPMENT|ATR)\W*$/i;
/** The airframes a table prints bare, in a column of their own ("6E 388
 * (A320)"): read as a designator, "A320" is Aegean flight 20. */
const AIRFRAME = /^(?:A3(?:18|19|20|21|30|40|50|80)|A2[01]N|B7(?:37|47|57|67|77|87)|B3[89]M|B77[WL]|E1(?:70|75|90|95)|E2(?:90|95))$/;

/** Dates that are about the ticket, not the trip. */
const NOT_A_TRAVEL_DATE =
  /(NVA|NVB|EXPIR\w*|ISSUED?|ISSUE DATE|DATE\s*:|TICKETED|BOOKED|PRINTED|STATUS\s*:|STARTING|VALID\s+UNTIL|UNTIL|PURCHASED|PAID\s+ON|PAYMENT DATE|\bAS OF|BORN|BIRTH|DOB)[\W\d]{0,8}$/i;

/** Times that are durations or totals, not a departure/arrival. */
const NOT_A_CLOCK = /(DURATION|TRAVEL TIME|FLIGHT TIME|FLYING TIME|TOTAL|LAYOVER|CONNECTION|CHECK[- ]?IN\s+(CLOSES|OPENS|BY|DEADLINE))\W{0,12}$/i;

/** A leg table whose check-in column comes before departure ("Flight
 * Check-in at  Departure", as Emirates prints it): the first clock after
 * the flight number says when to be at the airport, not when the plane
 * leaves. Amadeus puts "Last check-in" after the arrival, where the parser
 * never looks. It is a header row, on one line, above the flight number —
 * tested on the text before the anchor only, so the small print that
 * follows a leg ("Check-in … will close 1 hour before departure") can't
 * swallow a departure clock. */
const CHECK_IN_FIRST = /\bflight\b[^\n]*\bcheck-?in(?:\s+at)?\b[^\n]*\bdeparture\b/i;

type ClockColumn = 'departs' | 'closes' | 'arrives';

const CLOCK_COLUMN_WORDS: [ClockColumn, RegExp][] = [
  // Stems, not words — a recogniser reads "Departa" and "Arrives Vla" —
  // but capitalised, as a column header is and the prose above a table
  // ("the best time to arrive for your journey") is not.
  ['departs', /\b(?:Depart|DEPART)\w{0,4}/g],
  ['arrives', /\b(?:Arriv|ARRIV)\w{0,4}/g],
  ['closes', /\b(?:(?:Last|LAST)\s+[Cc]heck-?in|(?:Check|CHECK)-?[Ii]n\s+(?:at|AT|closes|CLOSES)|Counter|COUNTER|Bag\s*[Dd]rop|BAG\s*DROP)\b/g],
];

/** The order a leg table prints its clocks in, read off the column headers
 * above the first leg — departure and arrival, plus the closing time
 * (counter, bag drop, last check-in) some tables put between or beside
 * them: IndiGo prints "Departs · Counter/Bag drop closes · Arrives",
 * Emirates "Check-in at · Departure", Amadeus "Departure · Arrival · Last
 * check-in". Null unless a closing column is named — without one the first
 * two clocks after the flight number are departure and arrival, as ever.
 * A column the header doesn't name goes last. */
function clockColumns(head: string): ClockColumn[] | null {
  const found: { col: ClockColumn; index: number }[] = [];
  for (const [col, re] of CLOCK_COLUMN_WORDS) {
    let last = -1;
    for (const m of head.matchAll(re)) last = m.index;
    if (last >= 0) found.push({ col, index: last });
  }
  if (!found.some((f) => f.col === 'closes')) return null;
  const cols = found.sort((a, b) => a.index - b.index).map((f) => f.col);
  for (const col of ['departs', 'arrives'] as const) if (!cols.includes(col)) cols.push(col);
  return cols;
}

/** The longest a counter or bag drop closes before a departure — Emirates
 * asks for check-in four hours ahead on some routes. */
const CLOSING_LEAD_MINUTES = 5 * 60;

const minutesOf = (clock: string): number => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));

/** Minutes from one clock to a later one, across midnight if need be. */
const minutesUntil = (from: string, to: string): number =>
  (minutesOf(to) - minutesOf(from) + 24 * 60) % (24 * 60);

/** A row's three clocks as departure and arrival. The headers' order is
 * tried first and kept when it reads sensibly — the closing time a few
 * hours at most before the departure; that keeps an overnight arrival's
 * small-hours clock where the page put it. A recogniser reading wrapped
 * cells returns them band by band, so headers and cells alike can come
 * out shuffled; when the header order makes no sense, the clocks are told
 * apart by value instead — closing, then departure, then arrival — with
 * the earliest read as the arrival only when it is too far ahead of the
 * middle one to be a closing time. */
function threeClocks(
  clocks: Mark<string>[],
  columns: ClockColumn[],
): { dep: Mark<string>; arr: Mark<string> } {
  const byHeader = {
    close: clocks[columns.indexOf('closes')],
    dep: clocks[columns.indexOf('departs')],
    arr: clocks[columns.indexOf('arrives')],
  };
  const lead = minutesUntil(byHeader.close.value, byHeader.dep.value);
  if (lead > 0 && lead <= CLOSING_LEAD_MINUTES) return { dep: byHeader.dep, arr: byHeader.arr };
  const [a, b, c] = [...clocks].sort((x, y) => minutesOf(x.value) - minutesOf(y.value));
  if (minutesOf(b.value) - minutesOf(a.value) <= CLOSING_LEAD_MINUTES) return { dep: b, arr: c };
  return { dep: c, arr: a };
}

/** Seats printed as a table of their own after the legs, one column per
 * route ("IXE → BLR  Seat 20A · BLR → TRV  Seat 20A"): the seats after
 * the last "Seat" heading, in order. Null when there are none. */
function seatTable(text: string): string[] | null {
  let last = -1;
  for (const m of text.matchAll(/\b(?:Seat|SEAT)\b/g)) last = m.index;
  if (last < 0) return null;
  const seats: string[] = [];
  for (const m of text.slice(last, last + SEAT_TABLE_REACH).matchAll(/\b(\d{1,3}[A-K])\b/g)) {
    const seat = normalizeSeat(m[1]);
    if (seat) seats.push(seat);
  }
  return seats.length ? seats : null;
}
const SEAT_TABLE_REACH = 160;

const ROUTE_PAIR_RE = /\b([A-Z]{3})\s*(?:→|->|—|–|-|>|\/|to)\s*([A-Z]{3})\b/g;

/** The routes a document lists on their own, in flying order and joined
 * into one journey — a seats or baggage table headed "IXE → BLR", "BLR →
 * TRV". Null unless at least two chain. */
function routeSummary(text: string): [string, string][] | null {
  const pairs: [string, string][] = [];
  for (const m of text.matchAll(ROUTE_PAIR_RE)) {
    if (!isValidIata(m[1]) || !isValidIata(m[2]) || m[1] === m[2]) continue;
    if (airportRank(m[1]) < 1 || airportRank(m[2]) < 1) continue;
    if (pairs.some(([a, b]) => a === m[1] && b === m[2])) continue;
    pairs.push([m[1], m[2]]);
  }
  if (pairs.length < 2) return null;
  for (let i = 1; i < pairs.length; i++) if (pairs[i - 1][1] !== pairs[i][0]) return null;
  return pairs;
}

const WINDOW_BACK = 320;
/** How far above its row a leg's date heading may sit when nothing nearer
 * dates the leg — Lufthansa puts an "Important Notice" paragraph between
 * "Sat. 06 February 2021: Bangalore – Frankfurt" and the row. The date
 * only: the airports still come from the ordinary window. */
const DATE_HEADING_REACH = 640;
/** How far above the first flight number the leg table's column headers
 * are looked for. */
const HEADER_REACH = 900;
/** A clock this close before the flight number, with no date between, is
 * on the flight's own row — the departure of a table that prints it left
 * of the number. */
const ROW_CLOCK_REACH = 48;
const WINDOW_FORWARD = 420;
/** Two dates this close after an anchor are departure and arrival days. */
const ARRIVAL_DATE_REACH = 170;

function pad2(n: number): string {
  return `${n}`.padStart(2, '0');
}

function isoDate(y: number, m: number, d: number): string | null {
  const date = new Date(y, m - 1, d, 12);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** A date printed without a year ("Sat, Oct 4"): people share documents near
 * their travel dates, so of last/this/next year the closest wins — after the
 * weekday, when printed, has vetoed the years it can't be. */
function resolveYearless(month: number, day: number, weekday: number | null, today: Date): string | null {
  let best: { iso: string; distance: number } | null = null;
  for (const year of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]) {
    const iso = isoDate(year, month, day);
    if (!iso) continue;
    const candidate = new Date(year, month - 1, day, 12);
    if (weekday != null && candidate.getDay() !== weekday) continue;
    const distance = Math.abs(+candidate - +today);
    if (!best || distance < best.distance) best = { iso, distance };
  }
  return best?.iso ?? null;
}

/** Month names, with the glyphs a recogniser confuses for 'l' folded back.
 * A photographed or screenshotted receipt reads "25Jul2026" as "25Ju|2026"
 * or "25Ju12026" often enough to lose the whole leg, and no month name
 * contains a pipe, a slash, a bang or a digit — so folding them costs
 * nothing and the MONTHS lookup still gates every match. */
function monthNumber(name: string): number | null {
  return MONTHS[name.toLowerCase().replace(/[|!1/]/g, 'l')] ?? null;
}

/** A month name as printed or as misread — see monthNumber. */
const MONTH_NAME = '[A-Za-z][A-Za-z|!1/]{2,8}';

function weekdayNumber(name: string | undefined): number | null {
  if (!name) return null;
  return WEEKDAYS[name.slice(0, 3).toLowerCase()] ?? null;
}

const DATE_PATTERNS: {
  re: RegExp;
  build: (m: RegExpExecArray, today: Date, text: string) => string | null;
  /** The pattern carries no year; build guessed the nearest one. */
  yearless?: true;
}[] = [
  // 25Jul2026 · 25 Jul 2026 · 25-Jul-26 · 4 October 2025 · 11 OCT '20
  // (optional weekday before). A two-digit "year" that a month name follows
  // is the next column's day ("06 Jun 06 Jun 07 Jun" is a summary strip of
  // three dates, not June 2006) and is left to the yearless pattern below —
  // unless an apostrophe marks it as a year, which nothing else has.
  {
    re: new RegExp(
      `(?:\\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\\.?,?\\s+)?\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]?(${MONTH_NAME})\\.?[\\s,-]{0,2}(?:(\\d{4})(?!\\d)|(['’]\\d{2}|\\d{2}(?![ \\t]?[A-Za-z]{3}))(?![\\d:]))`,
      'g',
    ),
    build: (m, _today, text) => {
      const month = monthNumber(m[3]);
      if (!month) return null;
      // A four-digit year may be followed by a colon ("Sat. 06 February
      // 2021: Bangalore – Frankfurt"); two digits before a colon are a
      // clock's hours.
      const printed = m[4] ?? m[5];
      const digits = printed.replace(/\D/g, '');
      // Two digits with a month name on the next line are a strip's next
      // column, not a year ("06 Jun 06\nJun 07 Jun"); a city or anything
      // else there ("04 Oct 20\nMangalore") leaves them a year.
      if (digits.length === 2 && !/['’]/.test(printed)) {
        const following = /^\s*([A-Za-z]{3,9})\b/.exec(text.slice(m.index + m[0].length));
        if (following && monthNumber(following[1])) return null;
      }
      const year = digits.length === 4 ? Number(digits) : 2000 + Number(digits);
      return isoDate(year, month, Number(m[2]));
    },
  },
  // October 8, 2025 · Oct 8 2025 · Wednesday October 8, 2025
  {
    re: new RegExp(
      `(?:\\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\\.?,?\\s+)?\\b(${MONTH_NAME})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
      'g',
    ),
    build: (m) => {
      const month = monthNumber(m[2]);
      if (!month) return null;
      return isoDate(Number(m[4]), month, Number(m[3]));
    },
  },
  // 2025-10-08
  {
    re: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    build: (m) => isoDate(Number(m[1]), Number(m[2]), Number(m[3])),
  },
  // 08/10/2025 · 08.10.2025 — day-first unless that can't be a day. Ambiguous
  // pairs default to day-first: the audience is EU261-first, and airlines
  // outside the US rarely print numeric US-order dates.
  {
    re: /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g,
    build: (m) => {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const [day, month] = a > 12 ? [a, b] : b > 12 ? [b, a] : [a, b];
      return isoDate(Number(m[3]), month, day);
    },
  },
  // Wed, October 1 · Sat, Oct 4 · WED, OCT 1 — a weekday, but no year
  {
    re: /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?,?\s+([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?![\s,]*\d{4})/gi,
    yearless: true,
    build: (m, today) => {
      const month = monthNumber(m[2]);
      if (!month) return null;
      return resolveYearless(month, Number(m[3]), weekdayNumber(m[1]), today);
    },
  },
  // Sat 4 Oct · Sat, 4 October
  {
    re: /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?,?\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\b(?![\s,-]*['’]?\d{2,4})/gi,
    yearless: true,
    build: (m, today) => {
      const month = monthNumber(m[3]);
      if (!month) return null;
      return resolveYearless(month, Number(m[2]), weekdayNumber(m[1]), today);
    },
  },
  // 28Nov · 4 Oct — a day and a month with no year anywhere near them, the
  // way an Amadeus itinerary table prints every leg of a trip. Last in the
  // list: everything above owns the dates that do carry a year, and this
  // one's lookahead yields to them — while letting through the clock that
  // usually follows, which is not a year (see the first pattern), and the
  // next date of a strip ("06 Jun 07 Jun"), whose day is not one either.
  {
    re: new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]?(${MONTH_NAME})\\b(?![\\s,-]{0,2}(?:\\d{4}(?![\\d:])|['’]\\d{2}|\\d{2}(?![\\d:]|\\s?[A-Za-z]{3})))`,
      'g',
    ),
    yearless: true,
    build: (m, today) => {
      const month = monthNumber(m[2]);
      if (!month) return null;
      return resolveYearless(month, Number(m[1]), null, today);
    },
  },
];

function findDates(text: string, today: Date): Mark<string>[] {
  const marks: (Mark<string> & { yearless?: true })[] = [];
  for (const { re, build, yearless } of DATE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const value = build(m, today, text);
      if (!value) continue;
      // Overlapping hits from a looser pattern lose to the earlier, tighter one.
      if (marks.some((k) => m!.index < k.end && m!.index + m![0].length > k.index)) continue;
      if (NOT_A_TRAVEL_DATE.test(text.slice(Math.max(0, m.index - 24), m.index))) continue;
      // A clock with seconds right after the day ("25 Sep 20 16:25:59
      // (UTC)") is a system's booking or issue stamp; no timetable has one.
      if (/^[\s,]{0,3}\d{1,2}:\d{2}:\d{2}/.test(text.slice(m.index + m[0].length))) continue;
      marks.push({ index: m.index, end: m.index + m[0].length, value, ...(yearless ? { yearless } : {}) });
    }
  }
  // A document that prints the year once, in its heading ("SUN, 11 OCT
  // '20"), and then only "11 Oct" beside every clock: the printed year
  // wins over the nearest-year guess for each day it names.
  const printed = new Map<string, string>();
  for (const k of marks) if (!k.yearless) printed.set(k.value.slice(5), k.value);
  for (const k of marks) {
    const dated = k.yearless ? printed.get(k.value.slice(5)) : undefined;
    if (dated) k.value = dated;
  }
  return marks.sort((a, b) => a.index - b.index).map(({ index, end, value }) => ({ index, end, value }));
}

const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s?([AaPp])\.?[Mm]\.?(?![A-Za-z])|\b(\d{1,2}):(\d{2})\b(?!\s?[AaPp]\.?[Mm])/g;

function findTimes(text: string): Mark<string>[] {
  const marks: Mark<string>[] = [];
  TIME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TIME_RE.exec(text))) {
    let hours: number;
    let minutes: number;
    if (m[3]) {
      hours = Number(m[1]) % 12 + (m[3].toLowerCase() === 'p' ? 12 : 0);
      minutes = Number(m[2] ?? '0');
    } else {
      hours = Number(m[4]);
      minutes = Number(m[5]);
    }
    if (hours > 23 || minutes > 59) continue;
    // A bare "4pm" is a time; a bare "4" is not — but "12 am" in prose is rare
    // enough to accept.
    if (NOT_A_CLOCK.test(text.slice(Math.max(0, m.index - 28), m.index))) continue;
    // Part of an ISO timestamp or a date ("2025-10-08 11:59" is fine; ":30:00" seconds are not),
    // or a stamp with seconds ("16:25:59"): a system's clock, never a flight's.
    if (text[m.index - 1] === ':') continue;
    if (/^:\d{2}/.test(text.slice(m.index + m[0].length))) continue;
    marks.push({ index: m.index, end: m.index + m[0].length, value: `${pad2(hours)}:${pad2(minutes)}` });
  }
  return marks;
}

/** "QR517", "QR 517", and the hyphenated "6E-6273" Indian OTAs print. */
const DESIGNATOR_RE = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])( ?|-)(\d{1,4})\b/g;

interface Anchor {
  index: number;
  end: number;
  flight: string;
}

/** Glyph pairs a text recogniser swaps, either way: a screenshot of an
 * IndiGo itinerary reads "GE 388" or "SE 388" for 6E 388. */
const OCR_TWINS = new Set(['0O', '1I', '2Z', '5S', '6G', '6S', '8B']);
const ocrTwins = (a: string, b: string): boolean => OCR_TWINS.has(a + b) || OCR_TWINS.has(b + a);

/** The one carrier a document names, when it names exactly one — the
 * airline's own confirmation, an OTA's single-carrier booking. Null for a
 * page with several (a codeshare receipt) or none. */
function soleNamedCarrier(text: string): string | null {
  const present = Object.entries(CARRIERS).filter(([, { name }]) =>
    new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(text),
  );
  return present.length === 1 ? present[0][0] : null;
}

/** A designator prefix one recogniser slip away from the document's only
 * named airline is that airline's — unless the prefix's own airline is
 * named too. "SE 388" on a page that says IndiGo and nothing of XL
 * Airways is 6E 388. */
function foldOcrPrefix(prefix: string, sole: string | null): string {
  if (!sole || prefix === sole || prefix.length !== sole.length) return prefix;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] === sole[i]) continue;
    if (!ocrTwins(prefix[i], sole[i])) return prefix;
  }
  return sole;
}

function findDesignators(text: string): Anchor[] {
  const anchors: Anchor[] = [];
  const sole = soleNamedCarrier(text);
  DESIGNATOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DESIGNATOR_RE.exec(text))) {
    const prefix = foldOcrPrefix(m[1], sole);
    const known = prefix in CARRIERS;
    // Letter-digit codes (U2, W6) only when we know the carrier — otherwise
    // "A321" and "B737" become Aegean and some airline B7.
    if (!/^[A-Z]{2}$/.test(prefix) && !known) continue;
    if (NOT_AN_AIRLINE.has(prefix) && (!known || m[3].length < 3)) continue;
    // Never a designator: prices, references, times, aircraft types.
    const matchEnd = m.index + m[0].length;
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    const after = text.slice(matchEnd, matchEnd + 2);
    if (/[$€£#]\s?$/.test(before) || /^[:.]\d/.test(after) || /^[-/]\d/.test(after)) continue;
    if (AIRCRAFT_CONTEXT.test(before)) continue;
    if (!m[2] && AIRFRAME.test(m[0])) continue;
    // "1A/9L9QY8": a GDS-prefixed booking reference, not a flight.
    if (/\/$/.test(before)) continue;
    anchors.push({ index: m.index, end: matchEnd, flight: `${prefix}${Number(m[3])}` });
  }
  return anchors;
}

/** Documents that name the airline and print the flight number on its own
 * ("American Airlines … 3018"). Used only when no compact designator exists
 * anywhere — on a normal receipt this would only add noise. Two shapes: the
 * number right after the name (across a line break), or — when the document
 * names a single carrier — a line-leading number that a date follows, which
 * is how a sorted table row ("3018 October 8, 2025 11:59 PM") comes out. */
function findNamedCarrierFlights(text: string, dates: Mark<string>[]): Anchor[] {
  const anchors: Anchor[] = [];
  const present = Object.entries(CARRIERS).filter(([, { name }]) =>
    new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(text),
  );
  const notATime = '(?![:.]\\d|\\s?[AaPp]\\.?[Mm]|\\s?%|\\s?(?:kg|lb|pc|min|h\\b))';
  for (const [code, { name }] of present) {
    // \W between name and number: only punctuation or a line break may
    // separate them — "Airlines Self-Service Machine 3" is prose.
    const re = new RegExp(`\\b${escapeRegExp(name)}\\W{1,40}?\\b(\\d{2,4})\\b${notATime}`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const numberStart = m.index + m[0].length - m[1].length;
      if (/[$€£#(]\s?$/.test(text.slice(Math.max(0, numberStart - 3), numberStart))) continue;
      anchors.push({ index: m.index, end: m.index + m[0].length, flight: `${code}${Number(m[1])}` });
    }
  }
  if (present.length === 1) {
    const code = present[0][0];
    const re = new RegExp(`(?:^|\\n)[ \\t]*(\\d{2,4})\\b${notATime}`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const end = m.index + m[0].length;
      if (!dates.some((d) => d.index >= end && d.index - end <= 3)) continue;
      anchors.push({ index: m.index, end, flight: `${code}${Number(m[1])}` });
    }
  }
  return anchors.sort((a, b) => a.index - b.index);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "Kochi (COK) to Dubai (DXB)": a leg's route spelled out as a sentence,
 * the way Emirates heads each leg. Nothing else on a receipt has this shape. */
const ROUTE_SENTENCE_RE = /\(([A-Z]{3})\)\s*(?:to|-|–|—|→)\s*[^()\n]{0,48}?\(([A-Z]{3})\)/;

/** The leg's route: a route sentence anywhere in the window, else whatever
 * airports the window names, in order. */
function findAirports(window: string): string[] {
  const sentence = ROUTE_SENTENCE_RE.exec(window);
  if (
    sentence &&
    isValidIata(sentence[1]) &&
    isValidIata(sentence[2]) &&
    sentence[1] !== sentence[2]
  ) {
    return [sentence[1], sentence[2]];
  }
  return airportsIn(window);
}

/** Airport codes in the text, most to least trustworthy: "(LAX)"; pairs
 * like "LAS/DFW", "LAX → SFO", "LAX SFO"; Amadeus "COKDOH:" route keys; and
 * finally hub city names in the text ("DOHA HAMAD INTERNATIONAL"). */
function airportsIn(window: string): string[] {
  const large = (code: string) => airportRank(code) >= 1;
  const hub = (code: string) => airportRank(code) === 2;

  const parenthesized: string[] = [];
  for (const m of window.matchAll(/\(([A-Z]{3})\)/g)) {
    if (isValidIata(m[1])) parenthesized.push(m[1]);
  }
  if (distinct(parenthesized).length >= 2) return distinct(parenthesized);

  // A code printed big over its city, the way an OTA confirmation heads
  // each leg ("TRV" / "THIRUVANATHAPURAM" … "BLR" / "BENGALURU"): the code
  // is a whole line on its own, or the two codes of a leg share one line.
  const lines: string[] = [];
  for (const m of window.matchAll(/(?:^|\n)[ \t]*([A-Z]{3})(?:[ \t]+([A-Z]{3}))?[ \t]*(?=\n|$)/g)) {
    for (const code of [m[1], m[2]]) if (code && isValidIata(code) && large(code)) lines.push(code);
  }
  if (distinct(lines).length >= 2) return distinct(lines);

  const pairs: string[] = [];
  for (const m of window.matchAll(/\b([A-Z]{3})\s*(?:-|–|—|→|>|\/|to)\s*([A-Z]{3})\b/g)) {
    if (isValidIata(m[1]) && isValidIata(m[2]) && large(m[1]) && large(m[2])) pairs.push(m[1], m[2]);
  }
  for (const m of window.matchAll(/\b([A-Z]{3})\s+([A-Z]{3})\b/g)) {
    if (hub(m[1]) && hub(m[2])) pairs.push(m[1], m[2]);
  }
  // Amadeus route keys ("COKDOH:"). The colon is required: without it the
  // same six letters occur in fare and baggage tables ("ARNLAS") far from
  // any leg, and those stole the route off the last leg of a receipt.
  for (const m of window.matchAll(/\b([A-Z]{3})([A-Z]{3})\b(?=\s*:)/g)) {
    if (hub(m[1]) && hub(m[2])) pairs.push(m[1], m[2]);
  }
  if (distinct(pairs).length >= 2) return distinct(pairs);

  // One parenthesized code plus a city name is still a route; keep whatever
  // codes were found in front of the name matches.
  const named: { index: number; code: string }[] = [];
  const upper = window.toUpperCase();
  for (const airport of hubAirports()) {
    const city = airport.city.split(' (')[0];
    if (city.length < 4 || CITY_WORDS.has(city.toUpperCase())) continue;
    // A city with several hubs names all of them at the same spot in the
    // text ("LONDON" is LHR, LGW, LCY and STN), and taking them in table
    // order turned one leg into London → London. Only the city's main
    // international airport answers to the bare city name; the exact one is
    // the barcode's business (extractItinerary) or the traveller's.
    if (PRIMARY_AIRPORT[city.toUpperCase()] && PRIMARY_AIRPORT[city.toUpperCase()] !== airport.iata) {
      continue;
    }
    // No lookbehind (Hermes): the leading group eats the non-letter, so the
    // city starts one character in when the group matched.
    const re = new RegExp(`(^|[^A-Z])${city.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Z])`);
    const m = re.exec(upper);
    if (m) named.push({ index: m.index + m[1].length, code: airport.iata });
  }
  named.sort((a, b) => a.index - b.index);
  return distinct([...parenthesized, ...pairs, ...named.map((n) => n.code)]);
}

/** Hub cities that are also ordinary words in travel documents. */
const CITY_WORDS = new Set(['NICE', 'MALE', 'READING', 'MOBILE', 'GEORGE', 'VICTORIA']);

/** The one airport a bare city name means, for the thirteen cities whose
 * curated hubs collide. The main long-haul international field in each —
 * what "LONDON" prints on a ticket that is really flying from Heathrow. */
const PRIMARY_AIRPORT: Record<string, string> = {
  BANGKOK: 'BKK',
  BEIJING: 'PEK',
  'BUENOS AIRES': 'EZE',
  CHENGDU: 'CTU',
  CHICAGO: 'ORD',
  HOUSTON: 'IAH',
  LONDON: 'LHR',
  MOSCOW: 'SVO',
  'NEW YORK': 'JFK',
  OSAKA: 'KIX',
  SEOUL: 'ICN',
  SHANGHAI: 'PVG',
  'SÃO PAULO': 'GRU',
};

function distinct<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

const PNR_LABEL_RE =
  /(?:booking\s+(?:ref(?:erence)?|code|number)|confirmation\s+(?:#|no\.?|number|code)?|reservation\s+(?:code|number)|record\s+locator|PNR|locator|reference)\s*:?\s*#?/gi;
const PNR_REACH = 72;

/** The booking reference: the first record-locator-shaped token after a
 * label. Sorted layouts can drop another column between the two
 * ("Confirmation #\nSan Francisco, CA JQYOKV"), hence a reach rather than
 * adjacency; a GDS prefix ("1A/ABC123") is skipped. A bare "reference" is a
 * label too ("Etihad reference 3ZQTPV"): the token has to look like a
 * locator, and prose never does. */
function findPnr(text: string): string | null {
  PNR_LABEL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PNR_LABEL_RE.exec(text))) {
    const reach = text.slice(m.index + m[0].length, m.index + m[0].length + PNR_REACH);
    for (const token of reach.matchAll(/\b(?:[A-Z0-9]{2}\/)?([A-Z0-9]{5,7})\b/g)) {
      const ref = token[1];
      if (/^\d+$/.test(ref) || !/\d|^[A-Z]{6}$/.test(ref)) continue; // words, and bare numbers, aren't locators
      if (/^(NUMBER|LOCATOR|STATUS|TICKET)$/.test(ref)) continue;
      return ref;
    }
  }
  return null;
}

/** "Operated by: HORIZON AIR AS ALASKAHORIZON" — the name runs to the line
 * end or the next label.
 *
 * The airline has to sit on the label's own line: whitespace between the two
 * is same-line only, never a newline. A page whose columns come out in the
 * wrong order otherwise reads the *next line's* first words as the operator —
 * a Finnair receipt yielded "Frequent flyer number" as an airline that way. */
const OPERATED_BY_RE =
  /\boperated\s+by[^\S\n]*:?[^\S\n]*([A-Za-z][A-Za-z0-9 .&'-]{1,48}?)[^\S\n]*(?=\n|[^\S\n]{2,}|[^\S\n]+(?:Marketed|Booking|Cabin|Class|Seat|Baggage|Fare|Frequent|NVA|NVB)\b|$)/i;

function findOperator(window: string, marketing: string | null): ImportedSegment['operatedBy'] {
  const m = OPERATED_BY_RE.exec(window);
  if (!m) return null;
  const raw = m[1].trim();
  if (raw.length < 3) return null;
  const code = operatingBrand(raw, marketing);
  return { code, name: code ? CARRIERS[code].name : raw };
}

const SEAT_RE = /\bseat\s*(?:no\.?|number|assignment)?\s*:?\s*(\d{1,3}\s?[A-K])\b/i;
/** A "Seat" column header with its value on a later row, first on its line
 * ("Seat  Status  Arrival\n29K  Confirmed"), one row of other columns
 * allowed between. */
const SEAT_COLUMN_RE = /\bseat\b[^\n]*\n(?:[^\n]*\n){0,2}?[ \t]*(\d{1,3}[A-K])\b/i;
/** The same column read off a sorted row, where the seat is the row's last
 * token ("1. Doe Jane, Adult EF2QKI EF2QKI 24A"). */
const SEAT_ROW_END_RE = /\bseat\b[^\n]*\n(?:[^\n]*\n)?[^\n]*\s(\d{1,3}[A-K])[ \t]*(?=\n|$)/i;

function normalizeSeat(seat: string | null | undefined): string | null {
  if (!seat) return null;
  const compact = seat.replace(/\s/g, '').toUpperCase().replace(/^0+(?=\d)/, '');
  return /^\d{1,3}[A-K]$/.test(compact) ? compact : null;
}

/** 'HH:mm' order, wrapping past midnight: an arrival clock earlier than the
 * departure clock means the flight landed the next day. */
function nextDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dayOfYear(iso: string): number {
  const d = new Date(`${iso}T12:00:00`);
  const start = new Date(d.getFullYear(), 0, 1, 12);
  return Math.round((+d - +start) / 86_400_000) + 1;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/** The text half of extractItinerary, on its own — what a document with no
 * boarding-pass code is read from. Exported for the tests. */
export function extractSegmentsFromText(text: string, today = new Date()): ImportedSegment[] {
  return segmentsFromText(plainSpaces(text), today);
}

/** The non-breaking and narrow spaces a PDF sets between a code and its
 * number ("LH\u00a0755"), as the plain space every pattern here expects. */
const plainSpaces = (text: string): string => text.replace(/[\u00a0\u202f\u2007]/g, ' ');

function segmentsFromText(text: string, today: Date): ImportedSegment[] {
  const dates = findDates(text, today);
  let anchors = findDesignators(text);
  if (!anchors.length) anchors = findNamedCarrierFlights(text, dates);
  if (!anchors.length) return [];

  const times = findTimes(text);
  const pnr = findPnr(text);
  // The table's column headers sit above its first leg — not above the
  // first flight-shaped token on the page, which on a screenshot can be
  // the phone's own status bar.
  let columns: ClockColumn[] | null | undefined;

  const segments: ImportedSegment[] = [];
  // Where the previous leg's reading ended: the end of the last date or
  // clock it took. What lies between a leg's flight number and that point
  // is the previous leg's block — its airports, its dates — and on an
  // Etihad receipt the previous leg's "HEL  AMS" row sits closer to this
  // leg's number than its own "AMS  AUH" does, so the window starts after.
  let consumedEnd = 0;
  anchors.forEach((anchor, i) => {
    const prevEnd = i > 0 ? anchors[i - 1].end : 0;
    const nextStart = i + 1 < anchors.length ? anchors[i + 1].index : text.length;
    const from = Math.max(prevEnd, consumedEnd, anchor.index - WINDOW_BACK);
    const to = Math.min(nextStart, anchor.end + WINDOW_FORWARD);

    // A date after this leg's clocks that sits much nearer the next leg's
    // row than this one's is the next leg's heading ("Sat. 06 February
    // 2021: Frankfurt – Helsinki" over its row, as Lufthansa prints it),
    // not this leg's arrival day — taking it left that leg with no date at
    // all. Measured from this leg's last clock, so a date row under the
    // clocks (Etihad's "06 Jun 2026 Airbus A321 06 Jun 2026") stays here.
    const next = anchors[i + 1];
    const nextRowStart = next
      ? Math.min(next.index, ...times.filter((t) => t.end <= next.index && !text.slice(t.end, next.index).includes('\n')).map((t) => t.index))
      : text.length;
    let nearby = dates.filter((d) => {
      if (d.index < from || d.end > to) return false;
      if (!next || d.index < anchor.end) return true;
      const lastClock = times.filter((t) => t.index >= anchor.end && t.end <= d.index).pop();
      const mine = d.index - (lastClock?.end ?? anchor.end);
      const theirs = nextRowStart - d.end;
      return !(theirs >= 0 && theirs * 2 < mine);
    });
    if (!nearby.length) {
      const headingFrom = Math.max(prevEnd, consumedEnd, anchor.index - DATE_HEADING_REACH);
      const heading = dates.filter((d) => d.index >= headingFrom && d.end <= anchor.index).pop();
      if (heading) nearby = [heading];
    }
    if (!nearby.length) return; // a flight-number-shaped token with no date around it is not a leg
    columns ??= clockColumns(text.slice(Math.max(0, anchor.index - HEADER_REACH), anchor.index));
    const distance = (d: Mark<string>) =>
      d.index >= anchor.end ? d.index - anchor.end : anchor.index - d.end + 1; // after wins ties
    const departure = nearby.reduce((best, d) => (distance(d) < distance(best) ? d : best));

    const after = nearby.filter((d) => d.index >= departure.end && d.index - departure.end <= ARRIVAL_DATE_REACH);
    // Strictly later, or it isn't telling us anything the clocks can't: an
    // itinerary table repeats the departure day in its validity columns
    // ("Ok 28Nov 28Nov"), and taking that as the arrival buried the
    // overnight legs on their departure day.
    const arrival = after.find((d) => d.value > departure.value) ?? null;
    let arrivalDate = arrival?.value ?? null;

    const window = text.slice(from, to);
    // Only after the anchor: the window before it belongs to the previous leg's details.
    const tail = text.slice(anchor.end, to);

    let clocks = times.filter((t) => t.index >= anchor.end && t.end <= to);
    let depClock: Mark<string> | undefined;
    let arrClock: Mark<string> | undefined;
    if (columns) {
      // A table whose departure column sits left of the flight number puts
      // that clock just before it; take it onto the row when the clocks
      // after the number don't make three.
      if (clocks.length < 3) {
        const onRow = times.filter(
          (t) =>
            t.index >= from &&
            t.end <= anchor.index &&
            anchor.index - t.end <= ROW_CLOCK_REACH &&
            !dates.some((d) => d.index >= t.end && d.end <= anchor.index),
        );
        if (onRow.length) clocks = [onRow[onRow.length - 1], ...clocks];
      }
    }
    // A row that prints the departure clock before the flight number
    // ("03:35 h  Bangalore (BLR)  LH 755", as Lufthansa lays it out): the
    // clock on the number's own line is the departure, the next one the
    // arrival — else the leg after this one loses its clock to this one.
    const onLine = times.filter(
      (t) => t.index >= from && t.end <= anchor.index && !text.slice(t.end, anchor.index).includes('\n'),
    );
    if (columns && clocks.length >= 3) {
      clocks = clocks.slice(0, 3);
      ({ dep: depClock, arr: arrClock } = threeClocks(clocks, columns));
    } else if (!columns && onLine.length) {
      depClock = onLine[onLine.length - 1];
      arrClock = clocks[0];
      clocks = [depClock, ...clocks.slice(0, 1)];
    } else {
      // A closing column the row leaves blank — or, as Emirates prints it,
      // filled and first: the departure follows.
      if (CHECK_IN_FIRST.test(text.slice(from, anchor.index))) clocks = clocks.slice(1);
      depClock = clocks[0];
      arrClock = clocks[1];
    }
    const depTime = depClock?.value ?? null;
    const arrTime = arrClock?.value ?? null;
    if (!arrivalDate) arrivalDate = depTime && arrTime && arrTime < depTime ? nextDay(departure.value) : departure.value;
    consumedEnd = Math.max(
      departure.end,
      arrival?.end ?? 0,
      ...(columns ? clocks.map((c) => c.end) : [arrClock?.end ?? depClock?.end ?? 0]),
    );

    const airports = findAirports(window);
    const seatMatch = SEAT_RE.exec(tail) ?? SEAT_COLUMN_RE.exec(tail) ?? SEAT_ROW_END_RE.exec(tail);
    const operatedBy = findOperator(tail, anchor.flight.match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])/)?.[1] ?? null);

    segments.push({
      key: `${anchor.flight}-${departure.value}`,
      flight: anchor.flight,
      date: departure.value,
      arrivalDate,
      depTime,
      arrTime,
      fromCode: airports[0] ?? null,
      toCode: airports[1] ?? null,
      pnr,
      seat: normalizeSeat(seatMatch?.[1]),
      operatedBy,
      sources: ['text'],
    });
  });

  // The same leg printed twice (itinerary + receipt section) is one leg.
  const seen = new Set<string>();
  const once = segments.filter((s) => {
    if (seen.has(s.key)) return false;
    seen.add(s.key);
    return true;
  });
  // A page that lists its routes as a chain, one per flight found, has
  // said where each leg goes better than the leg blocks could: a code
  // set over a city the table doesn't know reads as no route, and the
  // chain printed under the last leg reads as that leg's.
  const summary = routeSummary(text);
  if (summary && summary.length === once.length) {
    once.forEach((s, i) => {
      [s.fromCode, s.toCode] = summary[i];
    });
  }
  // Likewise a seat table under the legs, one seat per flight found, seats
  // the legs whose own block printed none.
  const seats = seatTable(text);
  if (seats && seats.length === once.length) {
    once.forEach((s, i) => {
      s.seat ??= seats[i];
    });
  }
  // A summary strip prints the flight numbers in one row under a row of
  // dates, and proximity hands the first number the row's last date — a
  // leg a day off, with no clock to its name. It yields to the full
  // printing of the same flight a day either side.
  return once.filter(
    (s) =>
      s.depTime ||
      !once.some(
        (o) =>
          o !== s &&
          o.flight === s.flight &&
          !!o.depTime &&
          Math.abs(dayOfYear(o.date!) - dayOfYear(s.date!)) <= 1,
      ),
  );
}

function segmentsFromBarcodes(barcodes: string[], today: Date): ImportedSegment[] {
  const segments: ImportedSegment[] = [];
  for (const payload of distinct(barcodes)) {
    const pass = parseBcbp(payload);
    if (!pass) continue;
    for (const leg of pass.legs) {
      const date = resolveFlightDate(leg.dayOfYear, today);
      const key = `${leg.flight}-${date}`;
      if (segments.some((s) => s.key === key)) continue;
      segments.push({
        key,
        flight: leg.flight,
        date,
        arrivalDate: null,
        depTime: null,
        arrTime: null,
        fromCode: leg.fromCode,
        toCode: leg.toCode,
        pnr: leg.pnr || null,
        seat: normalizeSeat(leg.seat),
        // BCBP's leg block names the operating carrier, so the flight prefix already is it.
        operatedBy: null,
        sources: ['barcode'],
      });
    }
  }
  return segments;
}

/** Every flight the document describes, departure order.
 *
 * The barcode leads when there is one. A boarding-pass code is exact —
 * route, flight, day — where the printed page is a layout to be guessed at,
 * so the code's own legs are taken whole and the text fills what the code
 * doesn't carry: the other legs of the trip, the printed clock times, the
 * operating airline.
 *
 * A document without a boarding-pass code is read from the page alone. It
 * was refused for a while, after the page's guesses failed quietly (legs
 * read "28Nov 11:30" once became flights in 2011, and a leg between two of
 * London's airports) — but the airlines' own e-ticket receipts are exactly
 * the documents without one: Emirates prints an e-ticket record (the ticket
 * number, no flights), Etihad prints no code at all, and the refusal turned
 * them away with "not a ticket". The check on a misread page is downstream:
 * every leg is shown for review before it is saved, and looked up live.
 *
 * One thing no barcode carries is the year — BCBP dates are a bare day of
 * the year (see bcbp.resolveFlightDate). */
export function extractItinerary(pages: DocumentPage[], today = new Date()): ItineraryExtraction {
  const text = plainSpaces(pages.map((p) => p.text).join('\n'));
  const barcodes = pages.flatMap((p) => p.barcodes);
  const barcodeLegs = segmentsFromBarcodes(barcodes, today);
  const ticketNumbers = distinct(
    barcodes.map((b) => parseEticketRecord(b)?.ticketNumber).filter((n): n is string => !!n),
  );
  const textLegs = segmentsFromText(text, today);

  const merged: ImportedSegment[] = [];
  const claimed = new Set<string>();
  for (const leg of textLegs) {
    const match = barcodeLegs.find(
      (b) =>
        !claimed.has(b.key) &&
        b.flight === leg.flight &&
        (!leg.date || !b.date || dayOfYear(leg.date) === dayOfYear(b.date)),
    );
    if (!match) {
      merged.push(leg);
      continue;
    }
    claimed.add(match.key);
    // Same day either way (that is what matched), so the only thing left to
    // decide is the year — and the page is the one that knows it. A BCBP
    // date is a bare day of the year that resolveFlightDate has to guess
    // at, and "closest to today" is wrong for a receipt read months after
    // the trip: a January flight opened in September landed a year ahead,
    // as an upcoming trip. A printed "18Jan2026" is not a guess. Only a
    // page with no date at all leaves the year to the code. An arrival the
    // text put on the next day stays on the next day.
    const date = leg.date ?? match.date;
    const overnight = !!leg.date && !!leg.arrivalDate && leg.arrivalDate > leg.date;
    merged.push({
      ...leg,
      date,
      arrivalDate: date ? (overnight ? nextDay(date) : date) : leg.arrivalDate,
      fromCode: match.fromCode ?? leg.fromCode,
      toCode: match.toCode ?? leg.toCode,
      seat: match.seat ?? leg.seat,
      pnr: match.pnr ?? leg.pnr,
      sources: ['barcode', 'text'],
    });
  }
  for (const b of barcodeLegs) {
    if (!claimed.has(b.key)) merged.push({ ...b, arrivalDate: b.date });
  }

  merged.sort((a, b) => `${a.date ?? ''}T${a.depTime ?? ''}`.localeCompare(`${b.date ?? ''}T${b.depTime ?? ''}`));
  return { segments: merged, boardingPassBarcodes: barcodeLegs.length, ticketNumbers };
}
