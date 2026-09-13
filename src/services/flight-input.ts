/** What a person typed into the flight-number box, before any lookup.
 *
 * The box only lights "Search this flight" for a designator-shaped string,
 * and people who paste the wrong code off their ticket (the six-character
 * booking reference, the thirteen-digit e-ticket number) used to get the
 * same generic hint as an empty box, with no clue why nothing happened. This
 * names the mistake so the hint can say what to type instead. Pure string
 * work; the provider is never asked until the person confirms. */

import { CARRIERS } from '@/constants/carriers';
import { carrierForAccountingCode } from './eticket';
import { normalizeFlightNumber } from './flight-lookup';

export type FlightInputClass =
  /** A flight designator. `carrier` is the airline name when the two-letter
   * code is in the carrier table, else null — a PNR like AB1234 has the same
   * shape, so an unknown prefix deserves a nudge before the lookup fails. */
  | { kind: 'flight'; flight: string; carrier: string | null }
  /** A booking reference / record locator: six letters and digits mixed. */
  | { kind: 'pnr' }
  /** An IATA e-ticket number: 13 digits, often printed 176-1234567890.
   * `carrier` names the issuing airline when the accounting prefix is known. */
  | { kind: 'ticket'; carrier: string | null }
  | { kind: 'empty' }
  | { kind: 'unknown' };

export function classifyFlightInput(input: string): FlightInputClass {
  const compact = input.toUpperCase().replace(/[\s-]/g, '');
  if (!compact) return { kind: 'empty' };

  const flight = normalizeFlightNumber(input);
  if (flight) {
    const prefix = flight.slice(0, 2);
    return { kind: 'flight', flight, carrier: CARRIERS[prefix]?.name ?? null };
  }

  // 13 digits (the accounting prefix + 10-digit document number), sometimes
  // with a 4-digit coupon suffix, and sometimes still being typed — anything
  // from 10 digits up reads as a ticket number rather than a flight.
  if (/^\d{10,17}$/.test(compact)) {
    return { kind: 'ticket', carrier: carrierForAccountingCode(compact.slice(0, 3))?.name ?? null };
  }

  // A record locator is six alphanumerics. The ones that also look like a
  // flight were caught above; the rest need at least one letter (an all-digit
  // six is more likely a half-typed ticket number, which we cannot name).
  if (/^[A-Z0-9]{6}$/.test(compact) && /[A-Z]/.test(compact)) {
    return { kind: 'pnr' };
  }

  return { kind: 'unknown' };
}
