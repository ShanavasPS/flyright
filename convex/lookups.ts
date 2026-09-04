import { v } from 'convex/values';

import { isPro } from './entitlements';
import { mutation } from './_generated/server';
import { budget, lookupKey, lookupLimit, type LookupSubject } from './lookupShared';

// The convex/ tsconfig has no Node types; process exists at deploy time.
declare const process: { env: Record<string, string | undefined> };

/**
 * Daily lookup meter for the flight-status route (src/app/api/flight-status
 * +api.ts). The route runs on EAS Hosting (Cloudflare Workers), which has no
 * durable memory of its own, so it asks here before every provider call.
 *
 * Callable only with the shared LOOKUP_QUOTA_SECRET — the route has already
 * verified the caller's Clerk token (or decided it is an anonymous web
 * visitor) and passes the resulting subject; this mutation must not become
 * a public counter anyone can spend. The Pro limit is read from the
 * entitlements mirror, never from the client.
 */
export const consume = mutation({
  args: {
    secret: v.string(),
    day: v.string(),
    cost: v.number(),
    subject: v.union(
      v.object({ kind: v.literal('user'), userId: v.string() }),
      v.object({ kind: v.literal('anonymous'), address: v.string() }),
    ),
  },
  handler: async (ctx, { secret, day, cost, subject }) => {
    const expected = process.env.LOOKUP_QUOTA_SECRET;
    if (!expected || secret !== expected) throw new Error('forbidden');

    const resolved: LookupSubject =
      subject.kind === 'user'
        ? { kind: 'user', userId: subject.userId, pro: await isPro(ctx, subject.userId) }
        : { kind: 'anonymous', address: subject.address };
    const key = lookupKey(resolved, day);
    const row = await ctx.db
      .query('lookupQuota')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    const used = row?.count ?? 0;
    const result = budget(used, cost, lookupLimit(resolved));
    if (result.allowed) {
      const now = new Date().toISOString();
      if (row) await ctx.db.patch(row._id, { count: used + cost, updatedAt: now });
      else await ctx.db.insert('lookupQuota', { key, day, count: cost, updatedAt: now });
    }
    return result;
  },
});
