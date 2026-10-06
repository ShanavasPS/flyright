/** Pure IATA BCBP (Bar-Coded Boarding Pass, Resolution 792) parser — no
 * camera, no platform APIs, fully unit-testable.
 *
 * Every boarding-pass barcode — PDF417 on paper, Aztec/QR on phones — encodes
 * the same fixed-width text record: passenger, booking reference, and one
 * block per leg with route, carrier, flight number, and a day-of-year date.
 * The canonical single-leg example from the spec:
 *
 *   M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100
 *   ─┬┬────────┬─────────┬┬──────┬───┬───┬──┬────┬──┬┬───┬────┬┬┬
 *    M│  name (20)       E│pnr(7)│from│to │car│fl(5)│doy│seat│…
 *
 * The mandatory items are read, and from each leg's variable-size field the
 * frequent flyer airline and number (items 236, 237), the free baggage
 * allowance (118) and fast track (254); the rest of it, and the
 * airline-specific and security data after the last leg, is skipped.
 */

export interface BoardingPassLeg {
  /** Booking reference, e.g. "ABC123". */
  pnr: string;
  fromCode: string;
  toCode: string;
  /** Full designator ready for lookup, e.g. "AC834" (leading zeros dropped). */
  flight: string;
  /** Day of year 1–366; BCBP carries no year — see resolveFlightDate. */
  dayOfYear: number;
  seat: string | null;
  /** Compartment/cabin letter as printed ("J", "Y"), null when blank. */
  cabin: string | null;
  /** Check-in sequence number ("25" from "00025"), null when blank. */
  sequence: string | null;
  /** Free baggage allowance as encoded ("2PC", "20K"), null when the pass
   * doesn't carry the conditional section or leaves it blank. */
  baggage: string | null;
  /** The frequent flyer membership on this booking (items 236 and 237):
   * what the lounge desk and the gate see. Null when the pass leaves the
   * fields blank — that means unknown, not "no membership". Never stored;
   * only the match against a saved membership is (docs/lounges.md). */
  frequentFlyer: { airline: string; number: string } | null;
  /** Fast track at security (item 254, BCBP version 6+): true, false, or
   * null when the pass doesn't say. */
  fastTrack: boolean | null;
}

export interface BoardingPass {
  /** Raw "LAST/FIRSTTITLE" as encoded — kept for future use, never shown. */
  passengerName: string;
  legs: BoardingPassLeg[];
}

const HEADER_LEN = 23; // M + leg count + name(20) + e-ticket flag
const LEG_LEN = 37; // pnr(7) from(3) to(3) carrier(3) flight(5) doy(3) cabin(1) seat(4) seq(5) status(1) varsize(2)

function parseLeg(block: string): BoardingPassLeg | null {
  const pnr = block.slice(0, 7).trim();
  const fromCode = block.slice(7, 10);
  const toCode = block.slice(10, 13);
  const carrier = block.slice(13, 16).trim();
  const number = block.slice(16, 21).trim().replace(/^0+(?=\w)/, '');
  const dayOfYear = Number(block.slice(21, 24));
  const cabin = block.slice(24, 25).trim();
  const seat = block.slice(25, 29).trim();
  const sequence = block.slice(29, 34).trim().replace(/^0+(?=\d)/, '');

  if (!/^[A-Z]{3}$/.test(fromCode) || !/^[A-Z]{3}$/.test(toCode)) return null;
  if (!/^[A-Z0-9]{2,3}$/.test(carrier) || !/^\d{1,4}[A-Z]?$/.test(number)) return null;
  if (!Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > 366) return null;

  return {
    pnr,
    fromCode,
    toCode,
    flight: `${carrier}${number}`,
    dayOfYear,
    seat: seat || null,
    cabin: /^[A-Z]$/.test(cabin) ? cabin : null,
    sequence: /^\d+$/.test(sequence) ? sequence : null,
    baggage: null,
    frequentFlyer: null,
    fastTrack: null,
  };
}

/** A leg's repeated conditional items, from its variable-size field. The
 * first leg's field opens with the unique conditional items ('>', the
 * version, their hex size, the items); every leg then has its repeated
 * items: a hex size, then airline code (3), document number (10), selectee
 * (1), document verification (1), marketing carrier (3), frequent flyer
 * airline (3) and number (16), ID/AD (1), free baggage allowance (3) and
 * fast track (1). An item past the declared size is absent. */
function conditionalItems(field: string, first: boolean): Pick<BoardingPassLeg, 'baggage' | 'frequentFlyer' | 'fastTrack'> {
  const none = { baggage: null, frequentFlyer: null, fastTrack: null };
  let at = 0;
  if (first) {
    if (field[0] !== '>') return none;
    const unique = parseInt(field.slice(2, 4), 16);
    if (Number.isNaN(unique)) return none;
    at = 4 + unique;
  }
  const size = parseInt(field.slice(at, at + 2), 16);
  if (Number.isNaN(size)) return none;
  const items = field.slice(at + 2, at + 2 + size);
  const item = (start: number, length: number) => (size >= start + length ? items.slice(start, start + length).trim() : '');

  const allowance = item(38, 3);
  const airline = item(18, 3);
  const number = item(21, 16);
  const fastTrack = item(41, 1);
  return {
    baggage: /^\d{1,3}(PC|K|L)$/.test(allowance) ? allowance : null,
    frequentFlyer:
      /^[A-Z0-9]{2,3}$/.test(airline) && /^[A-Z0-9]{4,16}$/.test(number) ? { airline, number } : null,
    fastTrack: fastTrack === 'Y' ? true : fastTrack === 'N' ? false : null,
  };
}

/** Null whenever the payload isn't a plausible boarding pass — loyalty cards,
 * bag tags, and random QR contents must fall through silently. */
export function parseBcbp(data: string): BoardingPass | null {
  if (data[0] !== 'M') return null;
  const legCount = Number(data[1]);
  if (!Number.isInteger(legCount) || legCount < 1 || legCount > 4) return null;

  const passengerName = data.slice(2, 22).trim();
  const legs: BoardingPassLeg[] = [];
  let offset = HEADER_LEN;

  for (let i = 0; i < legCount; i++) {
    const block = data.slice(offset, offset + LEG_LEN);
    if (block.length < LEG_LEN) {
      // Some airlines truncate the final leg after the mandatory items the
      // spec requires scanners to read; accept it if the core fields parse.
      if (block.length < 24) return null;
    }
    const leg = parseLeg(block.padEnd(LEG_LEN));
    if (!leg) return null;

    // The 2-hex-digit variable-field size closes each block; hop over it.
    const varSize = parseInt(data.slice(offset + LEG_LEN - 2, offset + LEG_LEN), 16);
    if (!Number.isNaN(varSize) && varSize > 0) {
      Object.assign(leg, conditionalItems(data.slice(offset + LEG_LEN, offset + LEG_LEN + varSize), i === 0));
    }
    legs.push(leg);
    offset += LEG_LEN + (Number.isNaN(varSize) ? 0 : varSize);
  }

  return { passengerName, legs };
}

/**
 * BCBP dates are a bare day-of-year: "326" could be this year, last year
 * (an old printout), or early next year (scanned in late December). People
 * scan passes near their travel date, so the candidate closest to today wins.
 */
export function resolveFlightDate(dayOfYear: number, today = new Date()): string {
  let best: Date | null = null;
  for (const year of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]) {
    const candidate = new Date(year, 0, dayOfYear, 12);
    // Day 366 of a non-leap year spills into Jan 1 — not what was encoded.
    if (dayOfYear === 366 && candidate.getFullYear() !== year) continue;
    if (!best || Math.abs(+candidate - +today) < Math.abs(+best - +today)) best = candidate;
  }
  const chosen = best ?? new Date(today.getFullYear(), 0, dayOfYear, 12);
  const mm = `${chosen.getMonth() + 1}`.padStart(2, '0');
  const dd = `${chosen.getDate()}`.padStart(2, '0');
  return `${chosen.getFullYear()}-${mm}-${dd}`;
}
