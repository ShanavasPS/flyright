import { v } from 'convex/values';

import { internalQuery, mutation, query } from './_generated/server';
import { attentionFor, attentionTotal, peopleSeenFor } from './attentionHelpers';

/** What's waiting for me, by source — the People tab badge, the app icon
 * count and the "open on Followers" default all read this. Null signed out.
 * The client adds the one thing the server can't know: an app update it
 * hasn't been shown yet. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return attentionFor(ctx, identity.subject);
  },
});

/** One side of the People tab was on screen: everything on it up to now is
 * seen. Called whenever that side is showing and has something unseen —
 * including something that arrived while it was showing. */
export const markPeopleSeen = mutation({
  args: { side: v.union(v.literal('followers'), v.literal('following')) },
  handler: async (ctx, { side }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const now = new Date().toISOString();
    const patch = side === 'followers' ? { followersSeenAt: now } : { followingSeenAt: now };
    const row = await peopleSeenFor(ctx, identity.subject);
    if (row) await ctx.db.patch(row._id, patch);
    else {
      await ctx.db.insert('peopleSeen', {
        userId: identity.subject,
        followersSeenAt: null,
        followingSeenAt: null,
        ...patch,
      });
    }
  },
});

/** Whether an inbox push should set the icon's attention indicator: count
 * everything unseen after the mutation that created the event. The sender
 * converts any positive count to 1; only the app clears the indicator once
 * all sources (including an available update) have loaded and are empty. */
export const badgeFor = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => attentionTotal(await attentionFor(ctx, userId)),
});
