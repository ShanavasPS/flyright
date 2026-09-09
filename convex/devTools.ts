import { v } from 'convex/values';

import { internalMutation } from './_generated/server';
import { armHeadsUp } from './liveHelpers';

/**
 * Dev-only knobs, callable from the CLI alone (internal functions never
 * reach a client): `npx convex run devTools:patchLiveSession '{...}'`.
 *
 * Puts a live session into an arbitrary state — mid-air with a delay, back
 * to "not yet departed" — so follower surfaces can be screenshotted and
 * reviewed without waiting for a real flight to reach that moment. The
 * poller only ever moves a session forward (applyFlightFacts never nulls a
 * fact or regresses a stage), which is right for production and useless for
 * putting a landed demo flight back in the sky.
 */
export const patchLiveSession = internalMutation({
  args: {
    sessionId: v.id('liveSessions'),
    patch: v.record(v.string(), v.any()),
  },
  handler: async (ctx, { sessionId, patch }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error('No such session');
    await ctx.db.patch(sessionId, { ...patch, updatedAt: new Date().toISOString() });
    return await ctx.db.get(sessionId);
  },
});

/** Grant or revoke Pro for a user on this deployment — `npx convex run
 * devTools:setPro '{"userId":"user_x","proUntil":"2099-01-01T00:00:00Z"}'`
 * (null revokes). Production Pro comes from the RevenueCat webhook only;
 * this exists so the Pro badge can be seen on a seeded dev account. */
export const setPro = internalMutation({
  args: { userId: v.string(), proUntil: v.union(v.string(), v.null()) },
  handler: async (ctx, { userId, proUntil }) => {
    const row = await ctx.db
      .query('entitlements')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    const patch = { proUntil, source: 'devTools', updatedAt: new Date().toISOString() };
    if (row) await ctx.db.patch(row._id, patch);
    else await ctx.db.insert('entitlements', { userId, ...patch });
    return { userId, proUntil };
  },
});

/** Insert a journey for a seeded dev traveller — `npx convex run
 * devTools:insertJourney '{"userId":"user_dev_sam","number":"BA283","fromCode":"LHR",...}'`
 * — so connecting itineraries can be shown to a follower on the simulator
 * without a second device adding trips. Dev only; never callable by a client. */
export const insertJourney = internalMutation({
  args: {
    userId: v.string(),
    carrier: v.string(),
    carrierCountry: v.string(),
    number: v.string(),
    fromCode: v.string(),
    fromCountry: v.string(),
    toCode: v.string(),
    toCountry: v.string(),
    distanceKm: v.number(),
    scheduledDeparture: v.string(),
    scheduledArrival: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const naturalKey = `${args.number}-${args.scheduledDeparture.slice(0, 10)}`;
    const id = await ctx.db.insert('journeys', {
      ...args,
      naturalKey,
      mode: 'flight',
      ticketPriceAmount: null,
      ticketPriceCurrency: null,
      source: 'lookup',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    // What journeys.push does for a real trip: the T−24h heads-up, which for
    // a same-day leg runs at once and opens the live session the follower
    // surfaces read. Without it a seeded leg has no timeline to show.
    const row = await ctx.db.get(id);
    if (row) await armHeadsUp(ctx, row);
    return { id, naturalKey };
  },
});

/** Patch a dev journey — move a seeded connecting leg into the next hours so
 * the "under way" block can be screenshotted. Dev only. */
export const patchJourney = internalMutation({
  args: { id: v.id('journeys'), patch: v.record(v.string(), v.any()) },
  handler: async (ctx, { id, patch }) => {
    await ctx.db.patch(id, { ...patch, updatedAt: new Date().toISOString() });
    const row = await ctx.db.get(id);
    if (row) await armHeadsUp(ctx, row);
    return row;
  },
});

/** Arm (or re-arm) the heads-up for a journey — opens its live session at
 * once when departure is within a day. Dev only. */
export const armJourney = internalMutation({
  args: { id: v.id('journeys') },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error('No such journey');
    await armHeadsUp(ctx, row);
    return await ctx.db.get(id);
  },
});
