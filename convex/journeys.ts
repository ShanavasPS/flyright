import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

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

      if (!existing) {
        await ctx.db.insert('journeys', { ...row, userId: identity.subject });
      } else if (row.updatedAt > existing.updatedAt) {
        await ctx.db.patch(existing._id, row);
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
