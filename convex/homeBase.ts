import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { HOUR, limit } from './abuse';

/** The account's home base (docs/home-base.md). Only its owner reads the
 * periods; a follower's copy of a trip carries just the home that trip
 * counts from (homeBaseShared.tripHome), so both group it the same way. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const row = await ctx.db.query('homeBases').withIndex('by_user', (q) => q.eq('userId', identity.subject)).unique();
    return row ? { periods: row.periods, dismissed: row.dismissed, updatedAt: row.updatedAt, auto: row.auto ?? null } : null;
  },
});

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const period = v.object({
  id: v.string(),
  city: v.string(),
  country: v.string(),
  from: v.union(v.string(), v.null()),
  until: v.union(v.string(), v.null()),
});

/** Last write wins on the phone's `updatedAt`; an older copy is ignored. */
export const save = mutation({
  args: { periods: v.array(period), dismissed: v.array(v.string()), updatedAt: v.number() },
  handler: async (ctx, incoming) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError('Sign in to save your home base.');
    await limit(ctx, `home-base:${identity.subject}`, 120, HOUR);
    if (incoming.periods.length > 50 || incoming.dismissed.length > 200) throw new ConvexError('Too many home base entries.');
    for (const p of incoming.periods) {
      if (p.id.length > 80 || p.city.length > 80 || p.country.length > 2) throw new ConvexError('Invalid home base.');
      if ((p.from !== null && !DAY.test(p.from)) || (p.until !== null && !DAY.test(p.until))) throw new ConvexError('Invalid home base dates.');
      if (p.from && p.until && p.from > p.until) throw new ConvexError('A period cannot end before it starts.');
    }
    if (incoming.dismissed.some((d) => d.length > 120)) throw new ConvexError('Invalid home base.');
    const row = await ctx.db.query('homeBases').withIndex('by_user', (q) => q.eq('userId', identity.subject)).unique();
    if (row && row.updatedAt >= incoming.updatedAt) return { saved: false };
    const values = { periods: incoming.periods, dismissed: incoming.dismissed, updatedAt: incoming.updatedAt };
    if (row) await ctx.db.patch(row._id, values);
    else await ctx.db.insert('homeBases', { userId: identity.subject, ...values });
    return { saved: true };
  },
});

/** The automatic home the owner's phone worked out (autoHome), or null when
 * the journal names none. Kept apart from `save` so it never races an edit
 * of the periods: it carries no `updatedAt` and only ever sets this field. */
export const saveAuto = mutation({
  args: { auto: v.union(v.null(), v.object({ city: v.string(), country: v.string() })) },
  handler: async (ctx, { auto }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { saved: false };
    await limit(ctx, `home-base-auto:${identity.subject}`, 60, HOUR);
    if (auto && (auto.city.length > 80 || auto.country.length > 2)) throw new ConvexError('Invalid home base.');
    const row = await ctx.db.query('homeBases').withIndex('by_user', (q) => q.eq('userId', identity.subject)).unique();
    if (row) {
      if ((row.auto ?? null)?.city === auto?.city && (row.auto ?? null)?.country === auto?.country) return { saved: false };
      await ctx.db.patch(row._id, { auto });
    } else {
      await ctx.db.insert('homeBases', { userId: identity.subject, periods: [], dismissed: [], updatedAt: 0, auto });
    }
    return { saved: true };
  },
});
