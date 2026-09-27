import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { HOUR, limit } from './abuse';

/** The photo each trip on Flights shows, when the traveller changed it from
 * the destination's Wikipedia photo (docs/trip-covers.md). Keyed by the trip
 * group's id; a journal photo is named by its trip_photos id, which is the
 * same on every device. Only its owner reads it. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const row = await ctx.db.query('tripCovers').withIndex('by_user', (q) => q.eq('userId', identity.subject)).unique();
    return row ? { covers: row.covers, updatedAt: row.updatedAt } : null;
  },
});

const cover = v.object({
  groupId: v.string(),
  kind: v.union(v.literal('none'), v.literal('photo')),
  photoId: v.union(v.string(), v.null()),
});

/** Last write wins on the phone's `updatedAt`. */
export const save = mutation({
  args: { covers: v.array(cover), updatedAt: v.number() },
  handler: async (ctx, incoming) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError('Sign in to save trip photos.');
    await limit(ctx, `trip-covers:${identity.subject}`, 240, HOUR);
    if (incoming.covers.length > 2000) throw new ConvexError('Too many trip photos.');
    for (const c of incoming.covers) {
      if (c.groupId.length > 200 || (c.photoId?.length ?? 0) > 80) throw new ConvexError('Invalid trip photo.');
      if ((c.kind === 'photo') !== !!c.photoId) throw new ConvexError('Invalid trip photo.');
    }
    const row = await ctx.db.query('tripCovers').withIndex('by_user', (q) => q.eq('userId', identity.subject)).unique();
    if (row && row.updatedAt >= incoming.updatedAt) return { saved: false };
    if (row) await ctx.db.patch(row._id, { covers: incoming.covers, updatedAt: incoming.updatedAt });
    else await ctx.db.insert('tripCovers', { userId: identity.subject, covers: incoming.covers, updatedAt: incoming.updatedAt });
    return { saved: true };
  },
});
