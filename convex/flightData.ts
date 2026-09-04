/** The travel-day poll chain's route to the flight-data provider.
 *
 * This used to fetch the provider directly and unmetered, which made the poll
 * chain the largest consumer of a fixed monthly pool and the only one nobody
 * was counting — a shared trip is 20-30 calls (liveShared.nextPollDelayMs),
 * and two travellers on one flight paid for the same answers twice. It now
 * goes through the same cache, the same pool accounting and the same
 * normalizer as the flight-status route (convex/provider.ts,
 * convex/flightNormalize.ts).
 *
 * Polling is `background` work: nobody is watching a spinner, so when the
 * pool runs thin it yields to lookups a person actually triggered and lives
 * off the cache until the month turns over. Missing key or refused budget →
 * null, and the session falls back to traveller-written facts.
 */

import type { ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import {
  factsPatch,
  normalizeLeg,
  type FlightFactsPatch,
  type NormalizedFlight,
} from './flightNormalize';
import { flightByNumberPath, providerConfigured, providerFetch } from './providerFetch';
import { cacheExpiry, flightPhase, UNITS_PER_FLIGHT_CALL } from './providerShared';

export type { FlightFactsPatch };

export async function fetchFlightFacts(
  ctx: ActionCtx,
  flight: string,
  date: string,
): Promise<FlightFactsPatch | null> {
  if (!providerConfigured() || !flight || !date) return null;

  const begin = await ctx.runMutation(internal.provider.beginInternal, {
    flight,
    date,
    want: 'base',
    kind: 'background',
  });

  // Someone already bought this answer — another poll in this chain, the
  // traveller's own journey screen, a friend on the same flight.
  if (begin.outcome === 'cached') {
    return factsPatch(JSON.parse(begin.payload) as NormalizedFlight);
  }
  // Pool too thin to spend on background work. The session keeps its last
  // known facts rather than showing nothing.
  if (begin.outcome === 'refused') return null;

  const response = await providerFetch(flightByNumberPath(flight, date));
  const reported = response.budget
    ? { remaining: response.budget.remaining, limit: response.budget.limit }
    : null;

  const legs = response.body;
  const leg = response.ok && Array.isArray(legs) && legs.length > 0 ? legs[0] : null;

  if (!leg) {
    // Nothing cacheable, but the call still cost units — file them, or the
    // pool cannot see a run of misses.
    await ctx.runMutation(internal.provider.recordInternal, {
      flight,
      date,
      want: 'base',
      payload: null,
      phase: 'uncacheable',
      expiresAt: 0,
      units: UNITS_PER_FLIGHT_CALL,
      reported,
    });
    return null;
  }

  const facts = normalizeLeg(leg, flight, date);
  const now = Date.now();
  await ctx.runMutation(internal.provider.recordInternal, {
    flight,
    date,
    want: 'base',
    payload: JSON.stringify(facts),
    phase: flightPhase(facts, now),
    expiresAt: cacheExpiry(facts, now),
    units: UNITS_PER_FLIGHT_CALL,
    reported,
  });

  return factsPatch(facts);
}
