import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from './_generated/server';
import { limit, HOUR } from './abuse';
import { followerActivityAccess, stopFollowerActivity } from './followerActivityHelpers';
import { FOLLOWER_ACTIVITY_ENDED, FOLLOWER_ACTIVITY_PREFIX, followerActivityWindow, followerContentState } from './followerActivityShared';
import { ACTIVITY_LIFETIME_MS, activityAttributes, makeToken } from './liveShared';
import { pushLiveActivity, startLiveActivity } from './onesignal';

export const status = query({
  args: { sessionId: v.id('liveSessions') },
  handler: async (ctx, { sessionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const follow = await ctx.db.query('follows').withIndex('by_session_follower', q =>
      q.eq('sessionId', sessionId).eq('followerId', identity.subject)).unique();
    if (!follow) return null;
    const access = await followerActivityAccess(ctx, follow);
    if (!access) return null;
    return { enabled: !!follow.liveActivityEnabled, failed: !!follow.liveActivityError,
      phase: followerActivityWindow(access.session, Date.now()).phase };
  },
});

/** Only IDs belonging to this signed-in follower, for local orphan cleanup. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const rows = await ctx.db.query('follows').withIndex('by_follower', q => q.eq('followerId', identity.subject)).collect();
    const ids: string[] = [];
    for (const f of rows) {
      if (!f.liveActivityEnabled || !f.liveActivityId) continue;
      const access = await followerActivityAccess(ctx, f);
      if (access && followerActivityWindow(access.session, Date.now()).phase !== 'ended') ids.push(f.liveActivityId);
    }
    return ids;
  },
});

export const hasAudience = internalQuery({
  args: { sessionId: v.id('liveSessions') },
  handler: async (ctx, { sessionId }) => {
    const rows = await ctx.db.query('follows').withIndex('by_session', q => q.eq('sessionId', sessionId)).collect();
    for (const f of rows) {
      if (f.liveActivityEnabled && await followerActivityAccess(ctx, f)) return true;
    }
    return false;
  },
});

export const setEnabled = mutation({
  args: { sessionId: v.id('liveSessions'), enabled: v.boolean() },
  handler: async (ctx, { sessionId, enabled }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError('Sign in to follow this trip.');
    const follow = await ctx.db.query('follows').withIndex('by_session_follower', q =>
      q.eq('sessionId', sessionId).eq('followerId', identity.subject)).unique();
    if (!follow) throw new ConvexError('This trip is no longer shared with you.');
    if (!enabled) return stopFollowerActivity(ctx, follow);
    const access = await followerActivityAccess(ctx, follow);
    if (!access || followerActivityWindow(access.session, Date.now()).phase === 'ended') {
      throw new ConvexError('This trip is no longer live.');
    }
    if (follow.liveActivityEnabled) return;
    await limit(ctx, `follower-activity:${identity.subject}`, 20, HOUR);
    const rows = await ctx.db.query('follows').withIndex('by_follower', q => q.eq('followerId', identity.subject)).collect();
    if (rows.filter(f => f.liveActivityEnabled).length >= 3) {
      throw new ConvexError('You can keep three trips on your Lock Screen. Turn one off first.');
    }
    await ctx.db.patch(follow._id, { liveActivityEnabled: true, liveActivityError: false, liveActivityStartedAt: undefined });
    await reconcileFollow(ctx, (await ctx.db.get(follow._id))!);
  },
});

async function reconcileFollow(ctx: MutationCtx, follow: Doc<'follows'>) {
  if (!follow.liveActivityEnabled) return;
  const access = await followerActivityAccess(ctx, follow);
  const now = Date.now();
  const window = access && followerActivityWindow(access.session, now);
  if (!access || !window || window.phase === 'ended') return stopFollowerActivity(ctx, follow);
  if (follow.liveActivityWakeId) await ctx.scheduler.cancel(follow.liveActivityWakeId).catch(() => {});
  let wakeAt = window.startsAt;
  if (window.phase === 'live') {
    const restart = !follow.liveActivityId || now >= (follow.liveActivityStartedAt ?? 0) + ACTIVITY_LIFETIME_MS;
    let activityId = follow.liveActivityId!;
    if (restart) {
      if (follow.liveActivityId) await ctx.scheduler.runAfter(0, internal.followerActivities.endActivity, { activityId: follow.liveActivityId });
      activityId = `${FOLLOWER_ACTIVITY_PREFIX}${makeToken()}${makeToken()}`;
      await ctx.db.patch(follow._id, { liveActivityId: activityId, liveActivityStartedAt: now });
    }
    await ctx.scheduler.runAfter(0, internal.followerActivities.deliver, { followId: follow._id, activityId, start: restart });
    wakeAt = Math.min(window.endsAt, (restart ? now : follow.liveActivityStartedAt ?? now) + ACTIVITY_LIFETIME_MS);
  }
  const liveActivityWakeId = await ctx.scheduler.runAt(Math.max(now + 1000, wakeAt), internal.followerActivities.wake, { followId: follow._id });
  await ctx.db.patch(follow._id, { liveActivityWakeId });
}

export const wake = internalMutation({
  args: { followId: v.id('follows') },
  handler: async (ctx, { followId }) => {
    const follow = await ctx.db.get(followId);
    if (follow) await reconcileFollow(ctx, follow);
  },
});

export const syncSession = internalMutation({
  args: { sessionId: v.id('liveSessions') },
  handler: async (ctx, { sessionId }) => {
    const rows = await ctx.db.query('follows').withIndex('by_session', q => q.eq('sessionId', sessionId)).collect();
    for (const follow of rows) await reconcileFollow(ctx, follow);
  },
});

export const delivery = internalQuery({
  args: { followId: v.id('follows'), activityId: v.string() },
  handler: async (ctx, { followId, activityId }) => {
    const follow = await ctx.db.get(followId);
    if (!follow?.liveActivityEnabled || follow.liveActivityId !== activityId) return null;
    const access = await followerActivityAccess(ctx, follow);
    if (!access || followerActivityWindow(access.session, Date.now()).phase !== 'live') return null;
    const profile = await ctx.db.query('profiles').withIndex('by_user', q => q.eq('userId', follow.ownerId)).unique();
    const name = profile?.name ?? 'Your traveler';
    return {
      followerId: follow.followerId,
      attributes: { ...activityAttributes(access.session),
        journeyId: '',
        // Followers must never open a local journey with the owner's key.
        deepLink: `flyright://following/${access.session._id}`,
        followerSessionId: access.session._id,
      },
      content: followerContentState(access.session, name, Date.now()),
      name,
    };
  },
});

export const failed = internalMutation({
  args: { followId: v.id('follows'), activityId: v.string() },
  handler: async (ctx, { followId, activityId }) => {
    const follow = await ctx.db.get(followId);
    if (follow?.liveActivityId !== activityId) return;
    await stopFollowerActivity(ctx, follow);
    await ctx.db.patch(followId, { liveActivityError: true });
  },
});

export const deliver = internalAction({
  args: { followId: v.id('follows'), activityId: v.string(), start: v.boolean() },
  handler: async (ctx, { followId, activityId, start }) => {
    const args = { followId, activityId };
    const target = await ctx.runQuery(internal.followerActivities.delivery, args);
    if (!target) return;
    if (start) {
      const accepted = await startLiveActivity(target.followerId, activityId, target.attributes,
        target.content, `${target.name}'s trip`, String(target.content.headline)).catch(() => false);
      if (!accepted) await ctx.runMutation(internal.followerActivities.failed, args);
    } else {
      await pushLiveActivity(activityId, 'update', target.content);
    }
    // A disable/delete may race a start already in flight. End it again
    // after delivery if access disappeared during the network request.
    if (!(await ctx.runQuery(internal.followerActivities.delivery, args))) {
      await ctx.runAction(internal.followerActivities.endActivity, { activityId });
    }
  },
});

export const endActivity = internalAction({
  args: { activityId: v.string(), attempt: v.optional(v.number()) },
  handler: async (ctx, { activityId, attempt = 0 }): Promise<void> => {
    const ended = await pushLiveActivity(activityId, 'end', FOLLOWER_ACTIVITY_ENDED, true).catch(() => false);
    if (!ended && attempt < 3) {
      await ctx.scheduler.runAfter(15_000 * 4 ** attempt, internal.followerActivities.endActivity, { activityId, attempt: attempt + 1 });
    }
  },
});
