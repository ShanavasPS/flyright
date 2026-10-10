/** Gate, terminal and baggage belt from a second provider, for the airports
 * where the status provider has none.
 *
 * AeroDataBox reads gates off airports' own departure boards, and United
 * States airports publish none (measured 2026-10-10: 0 gates in 606
 * departures from DFW, JFK and ORF, 88 in 88 from HEL). FlightAware AeroAPI
 * carries them on its flight record, so a status answer that is missing them
 * inside the travel-day window is completed from there.
 *
 * Only those three facts cross over. Times, status and delay stay the status
 * provider's: the AeroAPI licence forbids use for passenger-rights claims
 * (docs/flight-paths.md, May Not §12), and the claim rules read times.
 *
 * Pure rules; the database and the HTTP are in airportInfo.ts.
 */

import type { AeroFlight } from './flightPathShared';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

export interface AirportInfo {
  gate: string | null;
  terminal: string | null;
  baggageBelt: string | null;
}

/** The part of a status answer this module reads and fills. */
export interface AirportInfoFacts {
  landed: boolean;
  from: { code: string | null };
  to: { code: string | null };
  scheduledDeparture: string | null;
  estimatedDeparture: string | null;
  actualDeparture: string | null;
  estimatedArrival: string | null;
  actualArrival: string | null;
  scheduledArrival: string | null;
  gate: string | null;
  terminal: string | null;
  baggageBelt: string | null;
}

/** Gates are assigned on the day; asking sooner buys an empty answer. */
export const INFO_LEAD_MS = 24 * HOUR_MS;
/** A belt is announced around landing and is of no use once the bags are
 * collected. */
export const BELT_AFTER_LANDING_MS = 90 * MINUTE_MS;

const clean = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text : null;
};

/** Whether a status answer is worth completing right now: a fact is missing
 * and the flight is at the point where that fact exists. Before departure
 * that is the gate and terminal; from departure until a while after landing
 * it is the belt. */
export function airportInfoWanted(facts: AirportInfoFacts, now: number): boolean {
  if (!facts.from.code || !facts.to.code || !facts.scheduledDeparture) return false;
  const departure = Date.parse(facts.estimatedDeparture ?? facts.scheduledDeparture);
  if (Number.isNaN(departure)) return false;

  if (!facts.actualDeparture && !facts.landed) {
    if (now < departure - INFO_LEAD_MS) return false;
    return !facts.gate || !facts.terminal;
  }

  if (facts.baggageBelt) return false;
  const arrival = Date.parse(facts.actualArrival ?? facts.estimatedArrival ?? facts.scheduledArrival ?? '');
  if (Number.isNaN(arrival)) return false;
  return now < arrival + BELT_AFTER_LANDING_MS;
}

/** The three facts off an AeroAPI flight record. */
export function airportInfoFrom(flight: AeroFlight | null): AirportInfo {
  return {
    gate: clean(flight?.gate_origin),
    terminal: clean(flight?.terminal_origin),
    baggageBelt: clean(flight?.baggage_claim),
  };
}

export const hasAirportInfo = (info: AirportInfo | null): boolean =>
  !!info && !!(info.gate || info.terminal || info.baggageBelt);

/** The status answer with its gaps filled. What the status provider said is
 * never replaced: it is the airport's own board where there is one. */
export function withAirportInfo<T extends AirportInfoFacts>(facts: T, info: AirportInfo | null): T {
  if (!info) return facts;
  return {
    ...facts,
    gate: facts.gate ?? info.gate,
    terminal: facts.terminal ?? info.terminal,
    baggageBelt: facts.baggageBelt ?? info.baggageBelt,
  };
}

/** Cache key, beside the flight's path in the same table. */
export function infoKey(flight: string, date: string): string {
  return `${flight}:${date}:info`;
}

/** How long an answer is kept before the provider is asked again. A gate
 * can still move, a missing one is announced any minute close to departure,
 * and a belt, once named, stays. */
export function infoExpiry(info: AirportInfo, facts: AirportInfoFacts, now: number): number {
  if (info.baggageBelt) return now + 6 * HOUR_MS;
  if (facts.actualDeparture || facts.landed) return now + 10 * MINUTE_MS;
  const departure = Date.parse(facts.estimatedDeparture ?? facts.scheduledDeparture ?? '');
  const close = !Number.isNaN(departure) && departure - now < 3 * HOUR_MS;
  if (info.gate) return now + (close ? 10 : 30) * MINUTE_MS;
  return now + (close ? 10 : 60) * MINUTE_MS;
}
