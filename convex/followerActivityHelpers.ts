import type { Doc } from './_generated/dataModel';
import { internal } from './_generated/api';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { maySee } from './audience';
import { blockedBetween } from './safetyHelpers';

/** A follow row is necessary but not sufficient: recheck visibility at
 * delivery time, including during concurrent privacy changes. */
export async function followerActivityAccess(ctx: MutationCtx | QueryCtx, follow: Doc<'follows'>) {
  const session = await ctx.db.get(follow.sessionId);
  if (!session || session.userId === follow.followerId || session.userId !== follow.ownerId) return null;
  if (await blockedBetween(ctx, session.userId, follow.followerId)) return null;
  const journey = await ctx.db.query('journeys').withIndex('by_user_key', q =>
    q.eq('userId', session.userId).eq('naturalKey', session.naturalKey)).unique();
  const seat = await ctx.db.query('circle').withIndex('by_owner_member', q =>
    q.eq('ownerId', session.userId).eq('memberId', follow.followerId)).unique();
  if (!journey || journey.deletedAt || !maySee(journey, !!seat?.close)) return null;
  // Revoking a public link ends lock-screen access for link-only followers.
  if (!seat && !session.shareToken) return null;
  return { session, journey };
}

export async function stopFollowerActivity(ctx: MutationCtx, follow: Doc<'follows'>) {
  if (follow.liveActivityWakeId) await ctx.scheduler.cancel(follow.liveActivityWakeId).catch(() => {});
  if (follow.liveActivityId) await ctx.scheduler.runAfter(0, internal.followerActivities.endActivity, {
    activityId: follow.liveActivityId,
  });
  await ctx.db.patch(follow._id, {
    liveActivityEnabled: false, liveActivityId: null, liveActivityWakeId: undefined,
    liveActivityError: false,
  });
}

/** Use at every follow-removal boundary so a closed app also loses access. */
export async function deleteFollow(ctx: MutationCtx, follow: Doc<'follows'>) {
  await stopFollowerActivity(ctx, follow);
  await ctx.db.delete(follow._id);
}
