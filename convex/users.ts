import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation, mutation } from './_generated/server';

/** Hard-deletes everything a user synced — called from the Clerk
 * user.deleted webhook (see http.ts), so account deletion leaves no
 * orphaned rows behind. Not a tombstone: the account is gone, nothing
 * will ever sync these rows again. */
export const purge = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query('journeys')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }

    // Live sessions they ran (cancel scheduled polls, end lock-screen widgets).
    const sessions = await ctx.db
      .query('liveSessions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    for (const session of sessions) {
      if (session.pollScheduledId) await ctx.scheduler.cancel(session.pollScheduledId).catch(() => {});
      if (session.activityId && session.status === 'active') {
        await ctx.db.patch(session._id, { status: 'canceled', shareToken: null });
        await ctx.scheduler.runAfter(0, internal.liveInternal.updateActivity, {
          sessionId: session._id,
        });
      }
      const follows = await ctx.db
        .query('follows')
        .withIndex('by_session', (q) => q.eq('sessionId', session._id))
        .collect();
      for (const f of follows) await ctx.db.delete(f._id);
      await ctx.db.delete(session._id);
    }

    // Their follows of other people's sessions.
    const theirFollows = await ctx.db
      .query('follows')
      .withIndex('by_follower', (q) => q.eq('followerId', userId))
      .collect();
    for (const f of theirFollows) await ctx.db.delete(f._id);

    // Circle rows in both directions, and any invite links they minted.
    for (const index of ['by_owner', 'by_member'] as const) {
      const field = index === 'by_owner' ? 'ownerId' : 'memberId';
      const rows = await ctx.db
        .query('circle')
        .withIndex(index, (q) => q.eq(field, userId))
        .collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
    const invites = await ctx.db
      .query('circleInvites')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect();
    for (const i of invites) await ctx.db.delete(i._id);
    for (const row of rows) {
      if (row.headsUpScheduledId) await ctx.scheduler.cancel(row.headsUpScheduledId).catch(() => {});
    }

    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (profile) await ctx.db.delete(profile._id);

    return rows.length;
  },
});

/** Display-name mirror for follower-facing copy, fed by the Clerk webhook
 * (user.created/user.updated) — Convex JWTs only carry the subject. */
export const upsertProfile = internalMutation({
  args: { userId: v.string(), name: v.string(), imageUrl: v.union(v.string(), v.null()) },
  handler: async (ctx, { userId, name, imageUrl }) => {
    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    const updatedAt = new Date().toISOString();
    if (existing) await ctx.db.patch(existing._id, { name, imageUrl, updatedAt });
    else await ctx.db.insert('profiles', { userId, name, imageUrl, updatedAt });
  },
});

/** Client-side fallback for the webhook: the signed-in app pushes its own
 * Clerk name/photo so circle members see "Sam", not "A traveler", even if
 * a webhook was missed or the deployment (dev) has none configured. Only
 * ever writes the caller's own row. */
export const syncMyProfile = mutation({
  args: { name: v.string(), imageUrl: v.union(v.string(), v.null()) },
  handler: async (ctx, { name, imageUrl }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', identity.subject))
      .unique();
    if (existing && existing.name === trimmed && existing.imageUrl === imageUrl) return;
    const updatedAt = new Date().toISOString();
    if (existing) await ctx.db.patch(existing._id, { name: trimmed, imageUrl, updatedAt });
    else await ctx.db.insert('profiles', { userId: identity.subject, name: trimmed, imageUrl, updatedAt });
  },
});
