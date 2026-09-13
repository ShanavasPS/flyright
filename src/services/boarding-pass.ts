/** The boarding pass a trip carries — the barcode read off a ticket, kept
 * so it can be shown again at the gate. Pure: what a stored code says about
 * a journey, and how a decoded symbol becomes something drawable. Reading
 * the code (camera, document reader) and drawing it (the native renderer)
 * live elsewhere; this file only interprets.
 *
 * One pass per trip: the traveller's own, and a rescan replaces it. A code
 * for a connection covers every leg in one payload (BCBP lists them all),
 * so the same code is attached to each leg it names and `passFacts` picks
 * the leg the trip is.
 */

import { parseBcbp, type BoardingPass, type BoardingPassLeg } from '@/services/bcbp';
import { parseEticketRecord } from '@/services/eticket';

/** The symbologies a boarding pass comes in: PDF417 on paper and receipts,
 * Aztec and QR on phone screens, Data Matrix allowed by the standard but
 * seen nowhere. Stored as-is so the pass is redrawn in the symbology the
 * airline printed, not translated into another. */
export const PASS_FORMATS = ['pdf417', 'aztec', 'qr', 'datamatrix'] as const;
export type PassFormat = (typeof PASS_FORMATS)[number];

export interface StoredPass {
  /** The barcode payload exactly as decoded — BCBP is whitespace-significant. */
  code: string;
  format: PassFormat;
}

/** A decoder's symbology name as one of ours, or null for anything else
 * (a Code 128 bag tag, an EAN). expo-camera says 'pdf417' / 'aztec' / 'qr'
 * / 'datamatrix'; the native readers are written to say the same; the
 * spellings other decoders use are folded in for good measure. */
export function asPassFormat(raw: string | null | undefined): PassFormat | null {
  // Lower-case, punctuation gone, and a symbology-namespace prefix
  // ("org.iso.", "VNBarcodeSymbology") dropped: what's left is the name.
  const key = (raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^(orgiso|vnbarcodesymbology|format)/, '');
  switch (key) {
    case 'pdf417':
      return 'pdf417';
    case 'aztec':
      return 'aztec';
    case 'qr':
    case 'qrcode':
      return 'qr';
    case 'datamatrix':
      return 'datamatrix';
    default:
      return null;
  }
}

/** Payloads longer than this are not boarding passes (a full BCBP with
 * security data runs to a few hundred characters); the cap is what the sync
 * accepts too. */
export const MAX_PASS_CODE_LENGTH = 2000;

/** A pass worth keeping: a code that parses as a boarding pass, in a
 * symbology we can redraw. Null for anything else. */
export function storablePass(code: string, format: string | null | undefined): StoredPass | null {
  const known = asPassFormat(format);
  if (!known || !code || code.length > MAX_PASS_CODE_LENGTH) return null;
  return parseBcbp(code) ? { code, format: known } : null;
}

/** Receipt codes identify a ticket for check-in, separately from its boarding pass. */
export function storableTicket(code: string, format: string | null | undefined): StoredPass | null {
  const known = asPassFormat(format);
  if (!known || !code || code.length > MAX_PASS_CODE_LENGTH) return null;
  return parseEticketRecord(code) ? { code, format: known } : null;
}

/** The trip a pass is matched against: the flight number and the route. */
export interface PassJourney {
  number: string;
  fromCode: string;
  toCode: string;
  /** Departure's local calendar day, when matching a code before attachment. */
  date?: string;
}

/** Which of the pass's legs is this trip — by flight number and route, then
 * by route alone (a codeshare leg is stored under the number on the ticket
 * while the code carries the operator's). Null when none fits. */
export function legFor(pass: BoardingPass, journey: PassJourney): BoardingPassLeg | null {
  const number = journey.number.toUpperCase();
  const sameRoute = (leg: BoardingPassLeg) =>
    leg.fromCode === journey.fromCode.toUpperCase() && leg.toCode === journey.toCode.toUpperCase();
  const sameDay = (leg: BoardingPassLeg) => {
    if (!journey.date) return true;
    const day = new Date(`${journey.date}T12:00:00Z`);
    const start = Date.UTC(day.getUTCFullYear(), 0, 0, 12);
    return Math.round((+day - start) / 86400000) === leg.dayOfYear;
  };
  return (
    pass.legs.find((leg) => leg.flight === number && sameRoute(leg) && sameDay(leg)) ??
    pass.legs.find((leg) => sameRoute(leg) && sameDay(leg)) ??
    null
  );
}

/** Whether a scanned pass belongs on this trip at all — the guard before a
 * code is attached to a row, so the pass for one flight never ends up on
 * another. */
export function passCovers(code: string, journey: PassJourney): boolean {
  const pass = parseBcbp(code);
  return !!pass && legFor(pass, journey) != null;
}

/** BCBP names are "LAST/FIRSTTITLE" in capitals, the title glued on with no
 * separator ("DOE/JOHNMR"). Shown the way the traveller would write it —
 * "John Doe" — with a trailing title dropped when what's left is still a
 * name. A lone surname ("DOE") stays as it is. */
export function holderName(encoded: string): string | null {
  const raw = encoded.trim();
  if (!raw) return null;
  const [last = '', first = ''] = raw.split('/');
  let given = first.trim();
  const title = /(MR|MRS|MS|MISS|MSTR|DR|CHD|INF)$/;
  const match = given.match(title);
  if (match && given.length - match[0].length >= 3) given = given.slice(0, -match[0].length);
  const parts = [given, last.trim()].filter(Boolean).map(titleCase);
  return parts.length ? parts.join(' ') : null;
}

function titleCase(word: string): string {
  return word
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part) => (part.length && /\S/.test(part) && part !== '-' ? part[0].toUpperCase() + part.slice(1) : part))
    .join('');
}

export interface PassFacts {
  ticketNumber?: string;
  /** "Luc Desmarais", or null when the code names nobody. */
  holder: string | null;
  seat: string | null;
  sequence: string | null;
  pnr: string | null;
  cabin: string | null;
  /** Which leg of the pass this trip is, 1-based, and how many it lists —
   * "Leg 2 of 3" on a connection's pass. */
  leg: number;
  legs: number;
}

export function codeFacts(code: string, journey: PassJourney): PassFacts | null {
  const ticket = parseEticketRecord(code);
  if (!ticket) return passFacts(code, journey);
  return {
    ticketNumber: ticket.ticketNumber, holder: null, seat: null, sequence: null,
    pnr: null, cabin: null, leg: 1, legs: 1,
  };
}

/** What the stored code says about this trip, for the pass card: the
 * matching leg's seat and sequence, the holder. Null when the code isn't a
 * boarding pass after all. */
export function passFacts(code: string, journey: PassJourney): PassFacts | null {
  const pass = parseBcbp(code);
  if (!pass) return null;
  const leg = legFor(pass, journey);
  if (!leg) return null;
  return {
    holder: holderName(pass.passengerName),
    seat: leg.seat ? leg.seat.replace(/^0+(?=\d)/, '') : null,
    sequence: leg.sequence,
    pnr: leg.pnr || null,
    cabin: leg.cabin,
    leg: pass.legs.indexOf(leg) + 1,
    legs: pass.legs.length,
  };
}

/** A decoded symbol, one string per row of modules, '1' where a module is
 * dark. What the native renderers hand back for either platform. */
export interface SymbolMatrix {
  width: number;
  height: number;
  rows: string[];
}

/** The matrix as one SVG path in module units: each row's dark runs become
 * `M x y h w v 1 h -w z` rectangles, so a stripe of a few thousand modules
 * draws as a single shape. Scale with the path's viewBox, never the path. */
export function matrixToPath(matrix: SymbolMatrix): string {
  const parts: string[] = [];
  matrix.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '1') {
        x += 1;
        continue;
      }
      let end = x;
      while (end < row.length && row[end] === '1') end += 1;
      parts.push(`M${x} ${y}h${end - x}v1h${x - end}z`);
      x = end;
    }
  });
  return parts.join('');
}
