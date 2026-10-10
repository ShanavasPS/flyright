/** Completing a status answer's gate, terminal and baggage belt from
 * FlightAware AeroAPI (rules and reasons in airportInfoShared.ts).
 *
 * One ident lookup per answer, at the price of a flight summary, counted
 * against the same monthly cap as the flight paths (`flightPathBudget`) and
 * cached beside them (`flightPaths`, key `<FLIGHT>:<DAY>:info`), so the
 * thirty-day retention sweep covers it and two travellers on one flight buy
 * it once. With no key set, or the cap spent, the answer is left as the
 * status provider gave it.
 */

import { v } from 'convex/values';

import { internal } from './_generated/api';
import { action, internalMutation, type ActionCtx } from './_generated/server';
import {
  airportInfoFrom,
  airportInfoWanted,
  infoExpiry,
  infoKey,
  type AirportInfo,
  type AirportInfoFacts,
} from './airportInfoShared';
import {
  configuredMonthlyCents,
  flightAwareConfigured,
  flightAwareFetch,
  flightByIdentPath,
} from './flightPathFetch';
import {
  callCents,
  lookupWindow,
  PATH_CACHE_MAX_AGE_MS,
  pathProviderBills,
  pickFlight,
  type AeroFlight,
} from './flightPathShared';

declare const process: { env: Record<string, string | undefined> };

const period = (now: number): string => new Date(now).toISOString().slice(0, 7);

type InfoBegin = { outcome: 'cached'; payload: string | null } | { outcome: 'permit' } | { outcome: 'refused' };

export const begin = internalMutation({
  args: { flight: v.string(), date: v.string() },
  handler: async (ctx, { flight, date }): Promise<InfoBegin> => {
    const now = Date.now();
    const cached = await ctx.db
      .query('flightPaths')
      .withIndex('by_key', (q) => q.eq('key', infoKey(flight, date)))
      .unique();
    if (cached && cached.expiresAt > now) return { outcome: 'cached', payload: cached.payload };

    const budget = await ctx.db
      .query('flightPathBudget')
      .withIndex('by_period', (q) => q.eq('period', period(now)))
      .unique();
    if ((budget?.cents ?? 0) >= configuredMonthlyCents()) return { outcome: 'refused' };
    return { outcome: 'permit' };
  },
});

export const record = internalMutation({
  args: {
    flight: v.string(),
    date: v.string(),
    payload: v.union(v.string(), v.null()),
    expiresAt: v.number(),
    cents: v.number(),
    cacheable: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.cents > 0) {
      const row = await ctx.db
        .query('flightPathBudget')
        .withIndex('by_period', (q) => q.eq('period', period(now)))
        .unique();
      const updatedAt = new Date(now).toISOString();
      if (row) await ctx.db.patch(row._id, { cents: row.cents + args.cents, updatedAt });
      else await ctx.db.insert('flightPathBudget', { period: period(now), cents: args.cents, updatedAt });
    }
    // An outage is charged when it was billed and nothing else; "asked,
    // nothing there" is an answer and is kept.
    if (!args.cacheable) return;

    const key = infoKey(args.flight, args.date);
    const row = await ctx.db
      .query('flightPaths')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    const fields = {
      payload: args.payload,
      kind: 'info',
      fetchedAt: now,
      expiresAt: Math.min(args.expiresAt, now + PATH_CACHE_MAX_AGE_MS),
    };
    if (row) await ctx.db.patch(row._id, fields);
    else await ctx.db.insert('flightPaths', { key, ...fields });
  },
});

/** The three facts for one flight, or null when there is nothing to add:
 * not wanted yet, not configured, cap spent, provider unwell, or the
 * provider does not have them either. Never throws: a status answer must
 * not fail over a nicety. */
export async function airportInfoFor(
  ctx: ActionCtx,
  flight: string,
  date: string,
  facts: AirportInfoFacts,
): Promise<AirportInfo | null> {
  try {
    const now = Date.now();
    if (!flightAwareConfigured() || !airportInfoWanted(facts, now)) return null;
    const departure = facts.scheduledDeparture!;
    const window = lookupWindow(departure, now);
    if (!window) return null;

    const permit: InfoBegin = await ctx.runMutation(internal.airportInfo.begin, { flight, date });
    if (permit.outcome === 'cached') return permit.payload ? (JSON.parse(permit.payload) as AirportInfo) : null;
    if (permit.outcome === 'refused') return null;

    const response = await flightAwareFetch(flightByIdentPath(flight, window, false));
    const flights = (response.body as { flights?: AeroFlight[] } | null)?.flights ?? [];
    const cents = pathProviderBills(response.status, response.ok) ? callCents('flight', flights.length) : 0;
    // 400 is "no such ident in this window", 404 a flight never seen: both
    // are answers. Anything else is an outage, charged if billed, not kept.
    const answered = response.ok || response.status === 404 || response.status === 400;
    const info = airportInfoFrom(
      answered ? pickFlight(flights, { from: facts.from.code!, to: facts.to.code!, departure }) : null,
    );
    await ctx.runMutation(internal.airportInfo.record, {
      flight,
      date,
      payload: JSON.stringify(info),
      expiresAt: infoExpiry(info, facts, now),
      cents,
      cacheable: answered,
    });
    return answered ? info : null;
  } catch (error) {
    console.warn('[airport-info] left as the status provider gave it', error);
    return null;
  }
}

const nullableString = v.union(v.string(), v.null());

/** The hosting route's way in, secret-gated like provider.fetchPath: the
 * route has a status answer in hand and asks for its gaps. */
export const fill = action({
  args: {
    secret: v.string(),
    flight: v.string(),
    date: v.string(),
    facts: v.object({
      landed: v.boolean(),
      from: v.object({ code: nullableString }),
      to: v.object({ code: nullableString }),
      scheduledDeparture: nullableString,
      estimatedDeparture: nullableString,
      actualDeparture: nullableString,
      scheduledArrival: nullableString,
      estimatedArrival: nullableString,
      actualArrival: nullableString,
      gate: nullableString,
      terminal: nullableString,
      baggageBelt: nullableString,
    }),
  },
  handler: async (ctx, { secret, flight, date, facts }): Promise<AirportInfo | null> => {
    const expected = process.env.LOOKUP_QUOTA_SECRET;
    if (!expected || secret !== expected) throw new Error('forbidden');
    return airportInfoFor(ctx, flight, date, facts);
  },
});
