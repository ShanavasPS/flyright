/** Block checks shared by the circle, updates and live functions. Kept apart
 * from safety.ts (the mutations) so circle.ts can import these without a
 * cycle — safety.ts needs circle's personCard. */

import type { MutationCtx, QueryCtx } from './_generated/server';

/** True when either of the two has blocked the other. Every door between
 * two people — join, requests, search, the share page, updates — asks this
 * first, and answers as if the other person simply wasn't there. */
export async function blockedBetween(ctx: QueryCtx | MutationCtx, a: string, b: string): Promise<boolean> {
  const ab = await ctx.db
    .query('blocks')
    .withIndex('by_blocker_blocked', (q) => q.eq('blockerId', a).eq('blockedId', b))
    .unique();
  if (ab) return true;
  const ba = await ctx.db
    .query('blocks')
    .withIndex('by_blocker_blocked', (q) => q.eq('blockerId', b).eq('blockedId', a))
    .unique();
  return !!ba;
}

/** Everyone `me` has blocked or been blocked by — for filtering lists. */
export async function blockedSet(ctx: QueryCtx | MutationCtx, me: string): Promise<Set<string>> {
  const out = new Set<string>();
  const mine = await ctx.db
    .query('blocks')
    .withIndex('by_blocker_blocked', (q) => q.eq('blockerId', me))
    .collect();
  for (const row of mine) out.add(row.blockedId);
  const theirs = await ctx.db
    .query('blocks')
    .withIndex('by_blocked', (q) => q.eq('blockedId', me))
    .collect();
  for (const row of theirs) out.add(row.blockerId);
  return out;
}

/** How long a declined follow request or invitation keeps the same ask from
 * being repeated. The decliner hears nothing in the meantime — the asker
 * sees "Requested", as they would if the answer were still pending. */
export const DECLINE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** The most recent request from `from` to `to` was declined within the
 * cooldown. Pairs with `pendingRequest`, which only sees open rows. */
export async function recentlyDeclined(
  ctx: QueryCtx | MutationCtx,
  fromUserId: string,
  toUserId: string,
  kind: 'invite' | 'follow',
): Promise<boolean> {
  const rows = await ctx.db
    .query('circleRequests')
    .withIndex('by_pair', (q) => q.eq('fromUserId', fromUserId).eq('toUserId', toUserId))
    .collect();
  const cutoff = Date.now() - DECLINE_COOLDOWN_MS;
  return rows.some(
    (r) =>
      (r.kind ?? 'invite') === kind &&
      r.status === 'declined' &&
      r.respondedAt !== null &&
      Date.parse(r.respondedAt) > cutoff,
  );
}
