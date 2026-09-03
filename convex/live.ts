import { v } from 'convex/values';

import { internal } from './_generated/api';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import {
  activeSessionForKey,
  circleFull,
  circleMembers,
  createSession,
  ensureCircleInvite,
  followerCount,
  journeyForKey,
  travelerName,
} from './liveHelpers';
import { stageIndex, NOTIFY_STAGES, toPublicSession } from './liveShared';

/** Travel-day live sessions: the traveler's device is the only writer of
 * stage state; followers and the public token page read reactively. All
 * mutations require auth and throw — they run behind explicit user actions,
 * never during auth settling (unlike journeys.list's deliberate []). */

async function requireIdentity(ctx: MutationCtx | QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Not authenticated');
  return identity;
}

/** Start (or return) the live session for a trip the caller owns. Snapshot
 * comes from the journeys mirror so the public page never joins into it. */
export const start = mutation({
  args: {
    naturalKey: v.string(),
    stage: v.union(v.string(), v.null()),
    stamps: v.record(v.string(), v.string()),
    activityId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { naturalKey, stage, stamps, activityId }) => {
    const identity = await requireIdentity(ctx);

    const existing = await activeSessionForKey(ctx, identity.subject, naturalKey);
    if (existing) {
      if (activityId && activityId !== existing.activityId) {
        await ctx.db.patch(existing._id, { activityId });
      }
      return { token: existing.shareToken };
    }

    const journey = await journeyForKey(ctx, identity.subject, naturalKey);
    if (!journey) throw new Error('Trip not found');
    const session = await createSession(ctx, journey, { stage, stamps, activityId });
    return { token: session.shareToken };
  },
});

/** The traveler device pushes its local stage state. No session and no
 * circle → no-op (the trip simply isn't shared). Flight-driven stages never
 * regress. */
export const setStage = mutation({
  args: {
    naturalKey: v.string(),
    stage: v.union(v.string(), v.null()),
    stamps: v.record(v.string(), v.string()),
    activityId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { naturalKey, stage, stamps, activityId }) => {
    const identity = await requireIdentity(ctx);
    let session = await activeSessionForKey(ctx, identity.subject, naturalKey);
    if (!session) {
      // A circle is a standing audience: the first stage tap on a trip
      // nobody explicitly shared still has to reach them. Without one,
      // the trip simply isn't shared.
      const members = await circleMembers(ctx, identity.subject);
      if (!members.length) return { shared: false };
      const journey = await journeyForKey(ctx, identity.subject, naturalKey);
      if (!journey) return { shared: false };
      session = await createSession(ctx, journey, { stage: null, stamps: {}, activityId });
    }

    // Keep server-observed flight stages even if the client lags.
    const flightStage =
      stageIndex(session.currentStage) >= stageIndex('departed') ? session.currentStage : null;
    const nextStage = stageIndex(flightStage) > stageIndex(stage) ? flightStage : stage;
    const nextStamps = { ...stamps };
    for (const key of ['departed', 'landed'] as const) {
      if (session.stageTimes[key] && !nextStamps[key]) nextStamps[key] = session.stageTimes[key];
    }

    // Debounced follower push: mark newly reached notify-stages immediately
    // (never re-notify), fire one push a minute later that reads the state
    // as it stands then — three quick taps become one message.
    const notifiedStages = { ...session.notifiedStages };
    let notifyWorthy = false;
    for (const key of Object.keys(nextStamps)) {
      if (NOTIFY_STAGES.has(key) && !notifiedStages[key]) {
        notifiedStages[key] = true;
        notifyWorthy = true;
      }
    }

    await ctx.db.patch(session._id, {
      currentStage: nextStage,
      stageTimes: nextStamps,
      notifiedStages,
      ...(activityId ? { activityId } : {}),
      updatedAt: new Date().toISOString(),
    });

    if (notifyWorthy && !session.pendingNotify) {
      await ctx.db.patch(session._id, { pendingNotify: true });
      await ctx.scheduler.runAfter(60_000, internal.liveInternal.notifyFollowers, {
        sessionId: session._id,
        kind: 'stage',
      });
    }
    return { shared: true };
  },
});

export const revokeShare = mutation({
  args: { naturalKey: v.string() },
  handler: async (ctx, { naturalKey }) => {
    const identity = await requireIdentity(ctx);
    const session = await activeSessionForKey(ctx, identity.subject, naturalKey);
    if (session) await ctx.db.patch(session._id, { shareToken: null });
  },
});

export const close = mutation({
  args: { naturalKey: v.string() },
  handler: async (ctx, { naturalKey }) => {
    const identity = await requireIdentity(ctx);
    const session = await activeSessionForKey(ctx, identity.subject, naturalKey);
    if (!session) return;
    if (session.pollScheduledId) await ctx.scheduler.cancel(session.pollScheduledId).catch(() => {});
    await ctx.db.patch(session._id, {
      status: 'closed',
      shareToken: null,
      pollScheduledId: null,
      updatedAt: new Date().toISOString(),
    });
  },
});

/** Traveler-initiated poll-now (app foregrounded on travel day). */
export const refreshFacts = mutation({
  args: { naturalKey: v.string() },
  handler: async (ctx, { naturalKey }) => {
    const identity = await requireIdentity(ctx);
    const session = await activeSessionForKey(ctx, identity.subject, naturalKey);
    if (!session || !session.number) return;
    const last = session.lastCheckedAt ? Date.parse(session.lastCheckedAt) : 0;
    if (Date.now() - last < 5 * 60_000) return;
    await ctx.scheduler.runAfter(0, internal.liveInternal.poll, { sessionId: session._id });
  },
});

export const follow = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const identity = await requireIdentity(ctx);
    const session = await ctx.db
      .query('liveSessions')
      .withIndex('by_token', (q) => q.eq('shareToken', token))
      .unique();
    if (!session || session.status !== 'active') throw new Error('Link expired');
    if (session.userId === identity.subject) throw new Error('Own session');

    const existing = await ctx.db
      .query('follows')
      .withIndex('by_session_follower', (q) =>
        q.eq('sessionId', session._id).eq('followerId', identity.subject),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert('follows', {
        sessionId: session._id,
        ownerId: session.userId,
        followerId: identity.subject,
        muted: false,
        createdAt: new Date().toISOString(),
      });
    }
    // The upgrade path from one trip to every trip: the traveler chose to
    // share with this person, so the follow page may offer the traveler's
    // circle invite — unless they're already in it, or the circle is full
    // (the traveler's problem to solve, not the follower's).
    const inCircle = await ctx.db
      .query('circle')
      .withIndex('by_owner_member', (q) =>
        q.eq('ownerId', session.userId).eq('memberId', identity.subject),
      )
      .unique();
    const circleInviteToken =
      inCircle || (await circleFull(ctx, session.userId))
        ? null
        : (await ensureCircleInvite(ctx, session.userId)).token;
    return { sessionId: session._id, circleInviteToken };
  },
});

export const unfollow = mutation({
  args: { sessionId: v.id('liveSessions') },
  handler: async (ctx, { sessionId }) => {
    const identity = await requireIdentity(ctx);
    const row = await ctx.db
      .query('follows')
      .withIndex('by_session_follower', (q) =>
        q.eq('sessionId', sessionId).eq('followerId', identity.subject),
      )
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});

/** PUBLIC — the follow page. `gone` lets the web page say "link expired"
 * instead of spinning; a valid-but-unauthorized caller can't exist here
 * because the token IS the authorization. */
export const byToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!token) return { gone: true as const };
    const session = await ctx.db
      .query('liveSessions')
      .withIndex('by_token', (q) => q.eq('shareToken', token))
      .unique();
    if (!session || session.status !== 'active') return { gone: true as const };
    // Signed-in viewers learn whether they already follow (circle members
    // arrive following) so the page doesn't offer a redundant button.
    const identity = await ctx.auth.getUserIdentity();
    let viewerFollows = false;
    if (identity) {
      const row = await ctx.db
        .query('follows')
        .withIndex('by_session_follower', (q) =>
          q.eq('sessionId', session._id).eq('followerId', identity.subject),
        )
        .unique();
      viewerFollows = !!row || session.userId === identity.subject;
    }
    return {
      ...toPublicSession(
        session,
        await travelerName(ctx, session.userId),
        await followerCount(ctx, session._id),
      ),
      viewerFollows,
    };
  },
});

/** The traveler's own session (incl. token and who's watching). Null while signed out — the
 * client passes 'skip' until Clerk settles. */
export const mine = query({
  args: { naturalKey: v.string() },
  handler: async (ctx, { naturalKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const session = await activeSessionForKey(ctx, identity.subject, naturalKey);
    if (!session) return null;
    const follows = await ctx.db
      .query('follows')
      .withIndex('by_session', (q) => q.eq('sessionId', session._id))
      .collect();
    const followers = [];
    for (const f of follows) {
      followers.push({ userId: f.followerId, name: await travelerName(ctx, f.followerId) });
    }
    return {
      token: session.shareToken,
      followerCount: follows.length,
      followers,
      status: session.status,
    };
  },
});

/** Sessions the caller follows, for the My travels "Following" section. */
export const following = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const rows = await ctx.db
      .query('follows')
      .withIndex('by_follower', (q) => q.eq('followerId', identity.subject))
      .collect();
    const out = [];
    for (const row of rows) {
      const session = await ctx.db.get(row.sessionId);
      if (!session || session.status !== 'active') continue;
      out.push({
        sessionId: row.sessionId,
        // Followers already hold the token (they followed through it), so
        // returning the current one just routes them back to the live page.
        token: session.shareToken,
        session: toPublicSession(
          session,
          await travelerName(ctx, session.userId),
          await followerCount(ctx, session._id),
        ),
      });
    }
    return out;
  },
});
