import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

/**
 * What is waiting for someone, counted the way an app icon counts: things
 * that arrived and haven't been looked at. Three sources, each with its own
 * notion of "looked at":
 *
 *   - support: threads holding a reply the traveller hasn't opened
 *     (supportThreads.unreadForUser, cleared by support.markRead);
 *   - the Followers side of the People tab: someone joined my circle, asked
 *     to follow me, or tried to and found it full — newer than the last time
 *     that side was on screen (peopleSeen.followersSeenAt);
 *   - the Following side: an invitation to follow someone, or someone
 *     allowing my ask — newer than peopleSeen.followingSeenAt.
 *
 * Pending requests count while unseen, not while unanswered: the segment
 * badge inside the tab keeps the "waiting" count for as long as an answer is
 * owed, the way Instagram keeps the follow-request count on its row while
 * the app icon clears once the activity page has been opened. A user with no
 * peopleSeen row has seen nothing — their first follower badges, the way a
 * first message would.
 */
export type Attention = {
  support: number;
  followers: number;
  following: number;
};

export type PeopleSide = 'followers' | 'following';

export async function peopleSeenFor(ctx: QueryCtx | MutationCtx, userId: string) {
  return ctx.db
    .query('peopleSeen')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
}

/** Whether something stamped `stamp` arrived after a side was last looked
 * at. ISO strings compare as strings; a null stamp means nothing was seen. */
export const after = (stamp: string | null | undefined, seenAt: string | null) =>
  !!stamp && (seenAt === null || stamp > seenAt);

/** Rows minted before circleRequests.kind existed are invitations. */
const kindOf = (r: Doc<'circleRequests'>) => r.kind ?? 'invite';

export async function unseenPeople(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<{ followers: number; following: number }> {
  const seen = await peopleSeenFor(ctx, userId);
  const followersSeenAt = seen?.followersSeenAt ?? null;
  const followingSeenAt = seen?.followingSeenAt ?? null;

  const members = await ctx.db
    .query('circle')
    .withIndex('by_owner', (q) => q.eq('ownerId', userId))
    .collect();
  const toMe = await ctx.db
    .query('circleRequests')
    .withIndex('by_to_status', (q) => q.eq('toUserId', userId).eq('status', 'pending'))
    .collect();
  const fromMePending = await ctx.db
    .query('circleRequests')
    .withIndex('by_from_status', (q) => q.eq('fromUserId', userId).eq('status', 'pending'))
    .collect();
  const fromMeAccepted = await ctx.db
    .query('circleRequests')
    .withIndex('by_from_status', (q) => q.eq('fromUserId', userId).eq('status', 'accepted'))
    .collect();

  const followers =
    members.filter((m) => after(m.createdAt, followersSeenAt)).length +
    toMe.filter((r) => kindOf(r) === 'follow' && after(r.createdAt, followersSeenAt)).length +
    // An invitation someone tried to accept while my circle was full: the
    // "tried to join" note on their pending row, on the Followers side.
    fromMePending.filter((r) => kindOf(r) === 'invite' && after(r.blockedAt, followersSeenAt))
      .length;
  // My ask to follow someone, allowed: a new person on the Following side —
  // as long as they still share with me. An allowed ask whose owner has
  // since removed me has no row to look at, so it must not count either,
  // or the badge could never be cleared.
  // One per person: an ask sent, allowed, removed and allowed again leaves
  // two accepted rows for the same pair.
  const allowedBy = new Set<string>();
  for (const r of fromMeAccepted) {
    if (kindOf(r) !== 'follow' || !after(r.respondedAt, followingSeenAt)) continue;
    if (allowedBy.has(r.toUserId)) continue;
    if (await shares(ctx, r.toUserId, userId)) allowedBy.add(r.toUserId);
  }
  const allowed = allowedBy.size;
  const following =
    toMe.filter((r) => kindOf(r) === 'invite' && after(r.createdAt, followingSeenAt)).length +
    allowed;
  return { followers, following };
}

/** When `ownerId` allowed `memberId`'s ask to follow them, if that ask was
 * accepted and they still share — the stamp the Following row is "New" by. */
export async function allowedAt(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  memberId: string,
): Promise<string | null> {
  const rows = await ctx.db
    .query('circleRequests')
    .withIndex('by_pair', (q) => q.eq('fromUserId', memberId).eq('toUserId', ownerId))
    .collect();
  let latest: string | null = null;
  for (const r of rows) {
    if (kindOf(r) !== 'follow' || r.status !== 'accepted' || !r.respondedAt) continue;
    if (latest === null || r.respondedAt > latest) latest = r.respondedAt;
  }
  return latest;
}

async function shares(ctx: QueryCtx | MutationCtx, ownerId: string, memberId: string) {
  return !!(await ctx.db
    .query('circle')
    .withIndex('by_owner_member', (q) => q.eq('ownerId', ownerId).eq('memberId', memberId))
    .unique());
}

export async function unreadSupport(ctx: QueryCtx | MutationCtx, userId: string) {
  const threads = await ctx.db
    .query('supportThreads')
    .withIndex('by_user_last', (q) => q.eq('userId', userId))
    .order('desc')
    .take(100);
  return threads.filter((t) => t.unreadForUser).length;
}

export async function attentionFor(ctx: QueryCtx | MutationCtx, userId: string): Promise<Attention> {
  const [support, people] = await Promise.all([
    unreadSupport(ctx, userId),
    unseenPeople(ctx, userId),
  ]);
  return { support, ...people };
}

export const attentionTotal = (a: Attention) => a.support + a.followers + a.following;
