/** Pure itinerary extraction from a travel document — no platform APIs, fully
 * unit-testable. The native side (modules/flyright-document-import) turns a
 * shared PDF into per-page text plus decoded barcodes; this file turns that
 * into flight segments the import screen can look up and save.
 *
 * Two sources, merged:
 *
 *  - Barcodes. Boarding passes carry an IATA BCBP record (parseBcbp), and so
 *    do the PDF417 stripes on Amadeus e-ticket receipts — route, flight,
 *    seat, and a day-of-year, but no year.
 *  - Text. Receipts and booking confirmations spell every leg out in prose,
 *    each in a different layout. Flight designators (QR517, "AS 774") anchor
 *    a segment; the nearest dates, times, and airports around each anchor
 *    fill it in.
 *
 * Text order differs by platform (PDFKit walks the content stream, PDFBox
 * sorts by position), so nothing here depends on line structure: everything
 * is proximity to the anchor within a bounded window.
 */

import { CARRIERS } from '@/constants/carriers';
import { airportRank, hubAirports, isValidIata } from '@/services/airports';
import { parseBcbp, resolveFlightDate } from '@/services/bcbp';

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
  sources: SegmentSource[];
}

export interface ItineraryExtraction {
  segments: ImportedSegment[];
  /** How many decoded barcodes parsed as boarding passes. */
  boardingPassBarcodes: number;
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

/** Dates that are about the ticket, not the trip. */
const NOT_A_TRAVEL_DATE =
  /(NVA|NVB|EXPIR\w*|ISSUED?|ISSUE DATE|DATE\s*:|TICKETED|BOOKED|PRINTED|STATUS\s*:|STARTING|VALID\s+UNTIL|UNTIL|PURCHASED|PAID\s+ON|PAYMENT DATE|\bAS OF|BORN|BIRTH|DOB)[\W\d]{0,8}$/i;

/** Times that are durations or totals, not a departure/arrival. */
const NOT_A_CLOCK = /(DURATION|TRAVEL TIME|FLIGHT TIME|FLYING TIME|TOTAL|LAYOVER|CONNECTION|CHECK[- ]?IN\s+(CLOSES|OPENS|BY|DEADLINE))\W{0,12}$/i;

const WINDOW_BACK = 320;
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

function monthNumber(name: string): number | null {
  return MONTHS[name.toLowerCase()] ?? null;
}

function weekdayNumber(name: string | undefined): number | null {
  if (!name) return null;
  return WEEKDAYS[name.slice(0, 3).toLowerCase()] ?? null;
}

const DATE_PATTERNS: {
  re: RegExp;
  build: (m: RegExpExecArray, today: Date) => string | null;
}[] = [
  // 25Jul2026 · 25 Jul 2026 · 25-Jul-26 · 4 October 2025 (optional weekday before)
  {
    re: /(?:\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?,?\s+)?\b(\d{1,2})(?:st|nd|rd|th)?[\s-]?([A-Za-z]{3,9})\.?[\s,-]{0,2}(\d{4}|\d{2})(?!\d)/g,
    build: (m) => {
      const month = monthNumber(m[3]);
      if (!month) return null;
      const year = m[4].length === 4 ? Number(m[4]) : 2000 + Number(m[4]);
      return isoDate(year, month, Number(m[2]));
    },
  },
  // October 8, 2025 · Oct 8 2025 · Wednesday October 8, 2025
  {
    re: /(?:\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?,?\s+)?\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g,
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
    build: (m, today) => {
      const month = monthNumber(m[2]);
      if (!month) return null;
      return resolveYearless(month, Number(m[3]), weekdayNumber(m[1]), today);
    },
  },
  // Sat 4 Oct · Sat, 4 October
  {
    re: /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?,?\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\b(?![\s,-]*\d{2,4})/gi,
    build: (m, today) => {
      const month = monthNumber(m[3]);
      if (!month) return null;
      return resolveYearless(month, Number(m[2]), weekdayNumber(m[1]), today);
    },
  },
];

function findDates(text: string, today: Date): Mark<string>[] {
  const marks: Mark<string>[] = [];
  for (const { re, build } of DATE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const value = build(m, today);
      if (!value) continue;
      // Overlapping hits from a looser pattern lose to the earlier, tighter one.
      if (marks.some((k) => m!.index < k.end && m!.index + m![0].length > k.index)) continue;
      if (NOT_A_TRAVEL_DATE.test(text.slice(Math.max(0, m.index - 24), m.index))) continue;
      marks.push({ index: m.index, end: m.index + m[0].length, value });
    }
  }
  return marks.sort((a, b) => a.index - b.index);
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
    // Part of an ISO timestamp or a date ("2025-10-08 11:59" is fine; ":30:00" seconds are not).
    if (text[m.index - 1] === ':') continue;
    marks.push({ index: m.index, end: m.index + m[0].length, value: `${pad2(hours)}:${pad2(minutes)}` });
  }
  return marks;
}

const DESIGNATOR_RE = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])( ?)(\d{1,4})\b/g;

interface Anchor {
  index: number;
  end: number;
  flight: string;
}

function findDesignators(text: string): Anchor[] {
  const anchors: Anchor[] = [];
  DESIGNATOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DESIGNATOR_RE.exec(text))) {
    const prefix = m[1];
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

/** Airport codes in the window, most to least trustworthy: "(LAX)"; pairs
 * like "LAS/DFW", "LAX → SFO", "LAX SFO"; Amadeus "COKDOH:" route keys; and
 * finally hub city names in the text ("DOHA HAMAD INTERNATIONAL"). */
function findAirports(window: string): string[] {
  const large = (code: string) => airportRank(code) >= 1;
  const hub = (code: string) => airportRank(code) === 2;

  const parenthesized: string[] = [];
  for (const m of window.matchAll(/\(([A-Z]{3})\)/g)) {
    if (isValidIata(m[1])) parenthesized.push(m[1]);
  }
  if (distinct(parenthesized).length >= 2) return distinct(parenthesized);

  const pairs: string[] = [];
  for (const m of window.matchAll(/\b([A-Z]{3})\s*(?:-|–|—|→|>|\/|to)\s*([A-Z]{3})\b/g)) {
    if (isValidIata(m[1]) && isValidIata(m[2]) && large(m[1]) && large(m[2])) pairs.push(m[1], m[2]);
  }
  for (const m of window.matchAll(/\b([A-Z]{3})\s+([A-Z]{3})\b/g)) {
    if (hub(m[1]) && hub(m[2])) pairs.push(m[1], m[2]);
  }
  for (const m of window.matchAll(/\b([A-Z]{3})([A-Z]{3})\b(?=\s*:|\s|$)/g)) {
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

function distinct<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

const PNR_LABEL_RE =
  /(?:booking\s+(?:ref(?:erence)?|code|number)|confirmation\s+(?:#|no\.?|number|code)?|reservation\s+(?:code|number)|record\s+locator|PNR|locator)\s*:?\s*#?/gi;
const PNR_REACH = 48;

/** The booking reference: the first record-locator-shaped token after a
 * label. Sorted layouts can drop another column between the two
 * ("Confirmation #\nSan Francisco, CA JQYOKV"), hence a reach rather than
 * adjacency; a GDS prefix ("1A/ABC123") is skipped. */
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

const SEAT_RE = /\bseat\s*(?:no\.?|number|assignment)?\s*:?\s*(\d{1,3}\s?[A-K])\b/i;

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

function segmentsFromText(text: string, today: Date): ImportedSegment[] {
  const dates = findDates(text, today);
  let anchors = findDesignators(text);
  if (!anchors.length) anchors = findNamedCarrierFlights(text, dates);
  if (!anchors.length) return [];

  const times = findTimes(text);
  const pnr = findPnr(text);

  const segments: ImportedSegment[] = [];
  anchors.forEach((anchor, i) => {
    const prevEnd = i > 0 ? anchors[i - 1].end : 0;
    const nextStart = i + 1 < anchors.length ? anchors[i + 1].index : text.length;
    const from = Math.max(prevEnd, anchor.index - WINDOW_BACK);
    const to = Math.min(nextStart, anchor.end + WINDOW_FORWARD);

    const nearby = dates.filter((d) => d.index >= from && d.end <= to);
    if (!nearby.length) return; // a flight-number-shaped token with no date around it is not a leg
    const distance = (d: Mark<string>) =>
      d.index >= anchor.end ? d.index - anchor.end : anchor.index - d.end + 1; // after wins ties
    const departure = nearby.reduce((best, d) => (distance(d) < distance(best) ? d : best));

    const after = nearby.filter((d) => d.index >= departure.end && d.index - departure.end <= ARRIVAL_DATE_REACH);
    let arrivalDate = after.find((d) => d.value >= departure.value)?.value ?? null;

    const clocks = times.filter((t) => t.index >= anchor.end && t.end <= to).map((t) => t.value);
    const depTime = clocks[0] ?? null;
    const arrTime = clocks[1] ?? null;
    if (!arrivalDate) arrivalDate = depTime && arrTime && arrTime < depTime ? nextDay(departure.value) : departure.value;

    const airports = findAirports(text.slice(from, to));
    // Only after the anchor: the window before it belongs to the previous leg's details.
    const seatMatch = SEAT_RE.exec(text.slice(anchor.end, to));

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
      sources: ['text'],
    });
  });

  // The same leg printed twice (itinerary + receipt section) is one leg.
  const seen = new Set<string>();
  return segments.filter((s) => {
    if (seen.has(s.key)) return false;
    seen.add(s.key);
    return true;
  });
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
        sources: ['barcode'],
      });
    }
  }
  return segments;
}

/** Every flight the document describes, departure order. Barcode legs are
 * authoritative for the route and seat; the text supplies the year the
 * barcode lacks and the printed times. */
export function extractItinerary(pages: DocumentPage[], today = new Date()): ItineraryExtraction {
  const text = pages.map((p) => p.text).join('\n');
  const barcodeLegs = segmentsFromBarcodes(pages.flatMap((p) => p.barcodes), today);
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
    merged.push({
      ...leg,
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
  return { segments: merged, boardingPassBarcodes: barcodeLegs.length };
}
