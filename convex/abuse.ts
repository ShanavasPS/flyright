import { ConvexError, v } from 'convex/values';
import { internalMutation, type MutationCtx } from './_generated/server';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Counters live outside the objects they protect: deleting an invitation or
 * changing an email never resets an allowance. A mutation commits all of its
 * counters and work together, or none of them. */
export async function limit(ctx: MutationCtx, key: string, maximum: number, window: number, cost = 1) {
  const now = Date.now();
  const row = await ctx.db.query('abuseLimits').withIndex('by_key', q => q.eq('key', key)).unique();
  const count = row && row.resetAt > now ? row.count : 0;
  if (count + cost > maximum) throw new ConvexError('Too many requests. Please try again later.');
  const fields = { count: count + cost, resetAt: row && row.resetAt > now ? row.resetAt : now + window };
  if (row) await ctx.db.patch(row._id, fields);
  else await ctx.db.insert('abuseLimits', { key, ...fields });
}

export function bounded(value: string, maximum: number, label = 'Value') {
  if (value.length > maximum) throw new ConvexError(`${label} is too long.`);
  return value;
}

export const prune = internalMutation({
  args: {},
  handler: async ctx => {
    const rows = await ctx.db.query('abuseLimits').withIndex('by_reset', q => q.lt('resetAt', Date.now())).take(500);
    for (const row of rows) await ctx.db.delete(row._id);
    const events = await ctx.db.query('revenueCatEvents').withIndex('by_time', q => q.lt('processedAt', Date.now() - 90 * DAY)).take(500);
    for (const event of events) await ctx.db.delete(event._id);
  },
});

/** Actions use a separate transaction before spending network resources. */
export const consume = internalMutation({
  args: { key: v.string(), maximum: v.number(), window: v.number() },
  handler: async (ctx, a) => limit(ctx, a.key, a.maximum, a.window),
});
