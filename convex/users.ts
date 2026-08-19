import { v } from 'convex/values';

import { internalMutation } from './_generated/server';

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
    return rows.length;
  },
});
