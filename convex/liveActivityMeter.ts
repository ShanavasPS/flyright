/** Abuse limits for the on-device Live Activity proxy (src/app/api/live-activity).
 *
 * The proxy exists so the OneSignal REST key stays server-side, and it can't
 * demand an account: a signed-out traveler's lock screen updates through it
 * too. What it can do is refuse to be a free relay. An activity id is minted
 * on the device from the platform CSPRNG (services/live-activity.ts) and is
 * the only thing that names the widget, so the limits here are per id and
 * per address: an activity lives at most ACTIVITY_TTL_MS, takes at most
 * MAX_UPDATES_PER_ACTIVITY updates, no faster than MIN_INTERVAL_MS apart,
 * and one address may drive at most MAX_PER_ADDRESS_PER_DAY calls a day.
 * Every ceiling is far above what one phone on a travel day produces (the
 * lifecycle ticks about once a minute for ~8h) and far below what makes the
 * key worth abusing. */

import { v } from 'convex/values';

import { internalMutation, mutation } from './_generated/server';
import { lookupDay } from './lookupShared';

declare const process: { env: Record<string, string | undefined> };

/** iOS ends every Live Activity after 8h; a day is generous. */
export const ACTIVITY_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_UPDATES_PER_ACTIVITY = 1500;
export const MIN_INTERVAL_MS = 1500;
export const MAX_PER_ADDRESS_PER_DAY = 3000;
const SWEEP_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

export type PermitResult =
  | { allowed: true }
  | { allowed: false; reason: 'expired' | 'exhausted' | 'too-fast' | 'address' };

export const permit = mutation({
  args: {
    secret: v.string(),
    activityId: v.string(),
    /** Hashed client address (the route never sends the raw IP). */
    address: v.string(),
    event: v.union(v.literal('update'), v.literal('end')),
  },
  handler: async (ctx, { secret, activityId, address, event }): Promise<PermitResult> => {
    const expected = process.env.LOOKUP_QUOTA_SECRET;
    if (!expected || secret !== expected) throw new Error('forbidden');
    const now = Date.now();

    const actKey = `act:${activityId}`;
    const act = await ctx.db
      .query('liveActivityMeter')
      .withIndex('by_key', (q) => q.eq('key', actKey))
      .unique();
    if (act) {
      if (now - act.firstAt > ACTIVITY_TTL_MS) return { allowed: false, reason: 'expired' };
      if (act.count >= MAX_UPDATES_PER_ACTIVITY) return { allowed: false, reason: 'exhausted' };
      // An end may follow an update immediately (the window closed).
      if (event === 'update' && now - act.lastAt < MIN_INTERVAL_MS) return { allowed: false, reason: 'too-fast' };
    }

    const addrKey = `addr:${address}:${lookupDay(new Date(now))}`;
    const addr = await ctx.db
      .query('liveActivityMeter')
      .withIndex('by_key', (q) => q.eq('key', addrKey))
      .unique();
    if (addr && addr.count >= MAX_PER_ADDRESS_PER_DAY) return { allowed: false, reason: 'address' };

    if (act) await ctx.db.patch(act._id, { count: act.count + 1, lastAt: now });
    else await ctx.db.insert('liveActivityMeter', { key: actKey, count: 1, firstAt: now, lastAt: now });
    if (addr) await ctx.db.patch(addr._id, { count: addr.count + 1, lastAt: now });
    else await ctx.db.insert('liveActivityMeter', { key: addrKey, count: 1, firstAt: now, lastAt: now });
    return { allowed: true };
  },
});

export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - SWEEP_AFTER_MS;
    const stale = await ctx.db
      .query('liveActivityMeter')
      .withIndex('by_last', (q) => q.lt('lastAt', cutoff))
      .take(500);
    for (const row of stale) await ctx.db.delete(row._id);
    return stale.length;
  },
});
