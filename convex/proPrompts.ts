import { ConvexError, v } from 'convex/values';

import { internalMutation, mutation, query } from './_generated/server';
import { isPro } from './entitlements';
import { journeyForKey } from './liveHelpers';
import { canSetProReminder, proReminderTime, proTripUpcoming } from './proShared';
import { limit, HOUR } from './abuse';

/** Account-wide suppression is monotonic. Another device can never undo ×. */
export const mine = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity?.subject !== userId) return null;
    const [preferences, reminders, pro] = await Promise.all([
      ctx.db.query('proPreferences').withIndex('by_user', q => q.eq('userId', userId)).unique(),
      ctx.db.query('proReminders').withIndex('by_user', q => q.eq('userId', userId)).collect(),
      isPro(ctx, userId),
    ]);
    const pending = [];
    if (!pro) for (const reminder of reminders) {
      if (reminder.state !== 'pending') continue;
      const trip = await journeyForKey(ctx, userId, reminder.journeyKey);
      if (!trip || !proTripUpcoming(trip)) continue;
      pending.push({ journeyKey: reminder.journeyKey, remindAt: proReminderTime(trip) });
    }
    return {
      introductionSeen: preferences?.introductionSeen ?? false,
      homeDismissed: preferences?.homeDismissed ?? false,
      reminders: pending,
      proUntil: (await ctx.db.query('entitlements').withIndex('by_user', q => q.eq('userId', userId)).unique())?.proUntil ?? null,
    };
  },
});

export const suppress = mutation({
  args: { userId: v.string(), introductionSeen: v.boolean(), homeDismissed: v.boolean() },
  handler: async (ctx, incoming) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity?.subject !== incoming.userId) throw new ConvexError('Sign in to save this preference.');
    const row = await ctx.db.query('proPreferences').withIndex('by_user', q => q.eq('userId', identity.subject)).unique();
    const values = {
      introductionSeen: !!(row?.introductionSeen || incoming.introductionSeen || incoming.homeDismissed),
      homeDismissed: !!(row?.homeDismissed || incoming.homeDismissed),
    };
    if (row) await ctx.db.patch(row._id, values);
    else await ctx.db.insert('proPreferences', { userId: identity.subject, ...values });
  },
});

/** In-app reminder only: selecting it never starts billing or sends a push. */
export const setReminder = mutation({
  args: { userId: v.string(), journeyKey: v.string(), action: v.union(v.literal('set'), v.literal('cancel'), v.literal('dismiss')) },
  handler: async (ctx, { userId, journeyKey, action }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity?.subject !== userId) throw new ConvexError('Sign in to save a reminder.');
    await limit(ctx, `pro-reminder:${userId}`, 60, HOUR);
    const existing = await ctx.db.query('proReminders').withIndex('by_user_key', q => q.eq('userId', userId).eq('journeyKey', journeyKey)).unique();
    if (action !== 'set') {
      if (existing) await ctx.db.patch(existing._id, { state: action === 'cancel' ? 'cancelled' : 'dismissed' });
      return;
    }
    const trip = await journeyForKey(ctx, userId, journeyKey);
    if (!trip || !canSetProReminder(trip)) throw new ConvexError('Choose an upcoming trip more than 2 days away.');
    if (await isPro(ctx, userId)) throw new ConvexError('Pro is already active.');
    if (existing) await ctx.db.patch(existing._id, { state: 'pending', createdAt: Date.now() });
    else await ctx.db.insert('proReminders', { userId, journeyKey, state: 'pending', createdAt: Date.now() });
  },
});

/** Expired consent must not revive if an old trip is later moved forward. */
export const clearExpired = internalMutation({
  args: {},
  handler: async ctx => {
    const reminders = await ctx.db.query('proReminders').collect();
    for (const reminder of reminders) {
      if (reminder.state !== 'pending') continue;
      const trip = await journeyForKey(ctx, reminder.userId, reminder.journeyKey);
      if (!trip || !proTripUpcoming(trip) || await isPro(ctx, reminder.userId)) {
        await ctx.db.patch(reminder._id, { state: 'cancelled' });
      }
    }
  },
});
