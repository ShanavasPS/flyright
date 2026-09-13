/** Wallet files are ZIP containers. Only pass.json is needed: never unpack
 * images, signatures or archive paths onto the filesystem. */
import { strFromU8, unzipSync } from 'fflate';
import { parseBcbp } from '@/services/bcbp';
import { asPassFormat, storablePass } from '@/services/boarding-pass';
import type { DocumentPage } from '@/services/itinerary';

export interface WalletFlightDetails {
  date: string | null;
  depTime: string | null;
  arrivalDate: string | null;
  arrTime: string | null;
  fromCode: string | null;
  toCode: string | null;
  flight: string | null;
  seat: string | null;
  pnr: string | null;
}

const MAX_ARCHIVE = 20 * 1024 * 1024;
const MAX_JSON = 512 * 1024;
const MAX_PASSES = 8;
const LINK_HELP = 'This Wallet link does not include a readable boarding pass. Share a screenshot showing its barcode, or the airline’s pass file instead.';
type Dict = Record<string, unknown>;
const object = (value: unknown): Dict => value && typeof value === 'object' && !Array.isArray(value) ? value as Dict : {};
const string = (value: unknown): string | null => typeof value === 'string' && value.length <= 2000 ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value.slice(0, 100) : [];

function dateAndTime(value: unknown): { date: string | null; time: string | null } {
  const match = string(value)?.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  if (!match || !Number.isFinite(Date.parse(`${match[1]}T12:00:00Z`)) || new Date(`${match[1]}T12:00:00Z`).toISOString().slice(0, 10) !== match[1]) return { date: null, time: null };
  return { date: match[1], time: match[2] && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(match[2]) ? match[2] : null };
}

function applePage(value: unknown): DocumentPage {
  const pass = object(value);
  const boarding = object(pass.boardingPass);
  if (boarding.transitType !== 'PKTransitTypeAir') throw new Error('This Wallet pass is not an airline boarding pass.');
  const fields = ['headerFields', 'primaryFields', 'secondaryFields', 'auxiliaryFields', 'backFields']
    .flatMap(key => list(boarding[key]).map(object));
  const semantics = Object.assign({}, ...fields.map(field => object(field.semantics)), object(pass.semantics)) as Dict;
  const field = (pattern: RegExp) => fields.find(f => pattern.test(`${string(f.key) ?? ''} ${string(f.label) ?? ''}`))?.value;
  const departure = dateAndTime(semantics.currentDepartureDate ?? semantics.originalDepartureDate ?? field(/\b(departure|depart|flight date|flightdate)\b/i));
  const arrival = dateAndTime(semantics.currentArrivalDate ?? semantics.originalArrivalDate ?? field(/\b(arrival|arrive)\b/i));
  const relevant = dateAndTime(pass.relevantDate);
  const raw = Array.isArray(pass.barcodes) && pass.barcodes.length ? pass.barcodes : [pass.barcode];
  const codes = list(raw).map(object).flatMap(barcode => {
    const message = string(barcode.message);
    const format = asPassFormat(string(barcode.format)?.replace(/^PKBarcodeFormat/, ''));
    const stored = message && format ? storablePass(message, format) : null;
    return stored ? [stored] : [];
  });
  if (!codes.length) throw new Error('This Wallet pass has no supported flight barcode. Share the airline’s boarding pass PDF or a screenshot of its barcode instead.');
  const distinct = codes.filter((code, index) => codes.findIndex(c => c.code === code.code) === index);
  return {
    text: '',
    barcodes: distinct.map(c => c.code),
    barcodeFormats: distinct.map(c => c.format),
    wallet: {
      date: departure.date ?? relevant.date,
      depTime: departure.time,
      arrivalDate: arrival.date,
      arrTime: arrival.time,
      fromCode: string(semantics.departureAirportCode),
      toCode: string(semantics.destinationAirportCode),
      flight: string(semantics.airlineCode) && string(semantics.flightNumber) ? `${semantics.airlineCode}${semantics.flightNumber}` : null,
      seat: string(semantics.seatNumber ?? field(/\bseat(?:number)?\b/i)),
      pnr: string(semantics.confirmationNumber ?? field(/\b(pnr|booking(?:reference)?|confirmation)\b/i)),
    },
  };
}

export function readWalletArchive(bytes: Uint8Array): DocumentPage[] {
  if (!bytes.length || bytes.length > MAX_ARCHIVE) throw new Error('Choose a Wallet pass under 20 MB.');
  let count = 0;
  let total = 0;
  let manifests = 0;
  const files = unzipSync(bytes, { filter: entry => {
    // A .pkpasses bundle contains .pkpass files. No recursive arbitrary ZIPs.
    if (entry.name !== 'pass.json' && !/^[^/\\]+\.pkpass$/i.test(entry.name)) return false;
    if (entry.name === 'pass.json' && ++manifests > 1) throw new Error('This Wallet file contains conflicting pass details.');
    if (++count > MAX_PASSES || entry.originalSize > (entry.name === 'pass.json' ? MAX_JSON : MAX_ARCHIVE)) throw new Error('This Wallet bundle is too large. Share up to eight passes at a time.');
    total += entry.originalSize;
    if (total > MAX_ARCHIVE) throw new Error('This Wallet bundle is too large.');
    return true;
  } });
  if (files['pass.json']) {
    if (files['pass.json'].length > MAX_JSON) throw new Error('This Wallet pass is too large.');
    return [applePage(JSON.parse(strFromU8(files['pass.json'])))];
  }
  const passes = Object.values(files);
  if (!passes.length) throw new Error('This file is not a readable Wallet pass.');
  return passes.flatMap(bytes => {
    let manifests = 0;
    const contents = unzipSync(bytes, { filter: entry => {
      if (entry.name !== 'pass.json') return false;
      if (++manifests > 1) throw new Error('This Wallet file contains conflicting pass details.');
      if (entry.originalSize > MAX_JSON) throw new Error('This Wallet pass is too large.');
      return true;
    } });
    if (!contents['pass.json']) throw new Error('This file is not a readable Wallet pass.');
    if (contents['pass.json'].length > MAX_JSON) throw new Error('This Wallet pass is too large.');
    return [applePage(JSON.parse(strFromU8(contents['pass.json'])))];
  });
}

/** Google save links sometimes contain the actual flight objects in a JWT.
 * Other links contain only private object IDs; those cannot be read by a
 * third-party app. Treat the embedded data as an import, never as auth, and
 * never fetch an arbitrary shared URL or log its token. */
export function readWalletText(text: string): DocumentPage[] {
  if (text.length > 512 * 1024) throw new Error(LINK_HELP);
  const candidate = text.match(/https:\/\/(?:pay|wallet)\.google\.com\/[^\s<>]+/)?.[0];
  if (!candidate) throw new Error(LINK_HELP);
  const url = new URL(candidate);
  if (url.username || url.password || url.port || !['pay.google.com', 'wallet.google.com'].includes(url.hostname)) throw new Error(LINK_HELP);
  const token = url.pathname.match(/^\/gp\/v\/save\/([A-Za-z0-9_.-]+)$/)?.[1];
  if (!token || token.split('.').length !== 3) throw new Error(LINK_HELP);
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
    const jwt = object(JSON.parse(strFromU8(Uint8Array.from(binary, char => char.charCodeAt(0)))));
    if (jwt.typ !== 'savetowallet' || jwt.aud !== 'google') throw new Error(LINK_HELP);
    const payload = object(jwt.payload);
    const classes = list(payload.flightClasses).map(object);
    const flights = list(payload.flightObjects).map(object);
    if (!flights.length || flights.length > MAX_PASSES) throw new Error(LINK_HELP);
    return flights.map(flight => {
      if (flight.rotatingBarcode) throw new Error('This pass uses a changing barcode. Open the original pass in Wallet to use it at the airport.');
      const barcode = object(flight.barcode);
      const code = string(barcode.value);
      const stored = code ? storablePass(code, string(barcode.type)) : null;
      if (!stored || !parseBcbp(stored.code)) throw new Error(LINK_HELP);
      const flightClass = Object.keys(object(flight.classReference)).length ? object(flight.classReference) : classes.find(c => c.id === flight.classId) ?? {};
      const departure = dateAndTime(flightClass.localScheduledDepartureDateTime);
      const arrival = dateAndTime(flightClass.localScheduledArrivalDateTime);
      const reservation = object(flight.reservationInfo);
      return {
        text: '', barcodes: [stored.code], barcodeFormats: [stored.format],
        wallet: {
          date: departure.date, depTime: departure.time,
          arrivalDate: arrival.date, arrTime: arrival.time,
          fromCode: string(object(flightClass.origin).airportIataCode),
          toCode: string(object(flightClass.destination).airportIataCode),
          flight: null, seat: string(object(flight.boardingAndSeatingInfo).seatNumber),
          pnr: string(reservation.confirmationCode),
        },
      };
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('changing barcode')) throw error;
    throw new Error(LINK_HELP);
  }
}
