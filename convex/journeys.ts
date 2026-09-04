import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import { armHeadsUp } from './liveHelpers';

/** Row shape the client pushes — deliberately has NO userId field: the server
 * stamps identity.subject, so a client can never write another user's rows. */
const journeyRow = v.object({
  naturalKey: v.string(),
  mode: v.string(),
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
  ticketPriceAmount: v.union(v.number(), v.null()),
  ticketPriceCurrency: v.union(v.string(), v.null()),
  notes: v.optional(v.union(v.string(), v.null())),
  notesUpdatedAt: v.optional(v.union(v.string(), v.null())),
  rating: v.optional(v.union(v.number(), v.null())),
  bookingReference: v.optional(v.union(v.string(), v.null())),
  seat: v.optional(v.union(v.string(), v.null())),
  source: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  deletedAt: v.union(v.string(), v.null()),
});

/** Last-write-wins upsert batch. Idempotent: ties and older rows are no-ops,
 * so client retries after flaky connections are harmless. */
export const push = mutation({
  args: { rows: v.array(journeyRow) },
  handler: async (ctx, { rows }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    for (const row of rows) {
      const existing = await ctx.db
        .query('journeys')
        .withIndex('by_user_key', (q) =>
          q.eq('userId', identity.subject).eq('naturalKey', row.naturalKey),
        )
        .unique();

      let journeyId = existing?._id ?? null;
      let scheduleChanged = false;
      if (!existing) {
        journeyId = await ctx.db.insert('journeys', { ...row, userId: identity.subject });
        scheduleChanged = true;
      } else if (row.updatedAt > existing.updatedAt) {
        await ctx.db.patch(existing._id, row);
        scheduleChanged =
          row.scheduledDeparture !== existing.scheduledDeparture ||
          !!row.deletedAt !== !!existing.deletedAt;
      }
      // New trip, moved departure, or deletion → the circle's T−24h
      // heads-up follows (see liveHelpers.armHeadsUp).
      if (scheduleChanged && journeyId) {
        const fresh = await ctx.db.get(journeyId);
        if (fresh) await armHeadsUp(ctx, fresh);
      }

      // A deleted trip takes its live session down with it — followers see
      // the page expire and the lock-screen widget ends, independent of any
      // further client cooperation. Whoever was following hears about it
      // once, so the trip doesn't just vanish from their People tab.
      if (row.deletedAt) {
        const sessions = await ctx.db
          .query('liveSessions')
          .withIndex('by_user_key', (q) =>
            q.eq('userId', identity.subject).eq('naturalKey', row.naturalKey),
          )
          .collect();
        for (const session of sessions) {
          if (session.status !== 'active') continue;
          if (session.pollScheduledId)
            await ctx.scheduler.cancel(session.pollScheduledId).catch(() => {});
          await ctx.db.patch(session._id, {
            status: 'canceled',
            shareToken: null,
            pollScheduledId: null,
            updatedAt: new Date().toISOString(),
          });
          if (session.activityId) {
            await ctx.scheduler.runAfter(0, internal.liveInternal.updateActivity, {
              sessionId: session._id,
            });
          }
          await ctx.scheduler.runAfter(0, internal.liveInternal.notifyFollowers, {
            sessionId: session._id,
            kind: 'removed',
          });
        }
      }
    }
  },
});

/** All of the caller's rows, tombstones included — the client subscribes to
 * this live. Journal scale is hundreds of rows; no pagination needed yet.
 * Returns [] rather than throwing while auth is still settling on the client. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return ctx.db
      .query('journeys')
      .withIndex('by_user', (q) => q.eq('userId', identity.subject))
      .collect();
  },
});
