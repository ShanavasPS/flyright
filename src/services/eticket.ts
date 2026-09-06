/** The other barcode on a ticket: the e-ticket record.
 *
 * A boarding pass carries a BCBP record (services/bcbp) — route, flight,
 * day. An airline's e-ticket receipt often carries a PDF417 too, and it is
 * not that: it encodes the ticket itself, for the self-service kiosks at
 * check-in. The payload as Emirates prints it (and Vision / ML Kit decode it):
 *
 *   E                 17622087106190201   17622087106190201   17622087106190201
 *   ┬                 ─┬─┬─────────┬───
 *   record type       │ │         │ four trailing digits (0201 on a single
 *                     │ │         │ ticket, 0202 on a two-document
 *                     │ │         │ conjunction ticket)
 *                     │ └ 10-digit document number
 *                     └ 3-digit airline accounting code (176 = Emirates)
 *
 * repeated across the stripe. No passenger, no route, no flight, no date —
 * so a scan of it can name the airline and the ticket and nothing else. The
 * document that carries it spells the flights out in print, which is what
 * services/itinerary reads.
 */

import { CARRIERS } from '@/constants/carriers';

export interface EticketRecord {
  /** "176-2208710619": accounting code, hyphen, document number. */
  ticketNumber: string;
  /** IATA two-letter code of the issuing airline when its accounting code
   * is known, else null. */
  carrier: string | null;
}

/** IATA accounting (ticketing) codes → two-letter airline codes, for the
 * carriers in the table. Airlines that don't issue IATA tickets (Ryanair,
 * easyJet, Wizz) have none. */
const ACCOUNTING_CODES: Record<string, string> = {
  '001': 'AA',
  '006': 'DL',
  '014': 'AC',
  '016': 'UA',
  '027': 'AS',
  '047': 'TP',
  '053': 'EI',
  '055': 'AZ',
  '057': 'AF',
  '065': 'SV',
  '071': 'ET',
  '072': 'GF',
  '074': 'KL',
  '075': 'IB',
  '077': 'MS',
  '080': 'LO',
  '081': 'QF',
  '082': 'SN',
  '086': 'NZ',
  '098': 'AI',
  '104': 'EW',
  '105': 'AY',
  '108': 'FI',
  '114': 'LY',
  '117': 'SK',
  '125': 'BA',
  '126': 'GA',
  '131': 'JL',
  '149': 'LG',
  '157': 'QR',
  '160': 'CX',
  '173': 'HA',
  '176': 'EK',
  '180': 'KE',
  '205': 'NH',
  '217': 'TG',
  '220': 'LH',
  '232': 'MH',
  '235': 'TK',
  '257': 'OS',
  '279': 'B6',
  '328': 'DY',
  '390': 'A3',
  '512': 'RJ',
  '526': 'WN',
  '607': 'EY',
  '618': 'SQ',
  '624': 'PC',
  '657': 'BT',
  '724': 'LX',
  '738': 'VN',
  '781': 'MU',
  '784': 'CZ',
  '831': 'OU',
  '838': 'WS',
  '910': 'WY',
  '932': 'VS',
  '988': 'OZ',
  '996': 'UX',
  '999': 'CA',
};

/** Null for anything that isn't an e-ticket record: boarding passes, loyalty
 * cards, URLs. The stripe repeats the number; every copy has to agree. */
export function parseEticketRecord(data: string): EticketRecord | null {
  const trimmed = data.trim();
  if (trimmed[0] !== 'E') return null;
  const tokens = trimmed.slice(1).trim().split(/\s+/);
  if (!tokens.length || !tokens[0]) return null;
  const [first] = tokens;
  if (!/^\d{13}(\d{4})?$/.test(first)) return null;
  if (tokens.some((t) => t !== first)) return null;
  const accounting = first.slice(0, 3);
  const carrier = ACCOUNTING_CODES[accounting] ?? null;
  return {
    ticketNumber: `${accounting}-${first.slice(3, 13)}`,
    carrier: carrier && carrier in CARRIERS ? carrier : null,
  };
}
