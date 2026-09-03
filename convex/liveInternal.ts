import { v } from 'convex/values';

import { internal } from './_generated/api';
import {
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import { fetchFlightFacts } from './flightData';
import {
  buildContentState,
  nextPollDelayMs,
  stageIndex,
  STAGE_PUSH_COPY,
  toPublicSession,
} from './liveShared';
import { pushLiveActivity, sendFollowerPush } from './onesignal';

/** Internal half of the live sessions: the self-rescheduling poll chain,
 * flight-fact merging, follower push fan-out, and Live Activity updates. */

const HOUR_MS = 3_600_000;

export const getSession = internalQuery({
  args: { sessionId: v.id('liveSessions') },
  handler: (ctx, { sessionId }) => ctx.db.get(sessionId),
});

export const getNotifyTargets = internalQuery({
  args: { sessionId: v.id('liveSessions') },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;
    const follows = await ctx.db
      .query('follows')
      .withIndex('by_session', (q) => q.eq('sessionId', sessionId))
      .collect();
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', session.userId))
      .unique();
    // Circle-level mute: the member keeps seeing the trip, just no pushes.
    const circle = await ctx.db
      .query('circle')
      .withIndex('by_owner', (q) => q.eq('ownerId', session.userId))
      .collect();
    const mutedByCircle = new Set(circle.filter((c) => c.muted).map((c) => c.memberId));
    return {
      externalIds: follows
        .filter((f) => !f.muted && !mutedByCircle.has(f.followerId))
        .map((f) => f.followerId),
      travelerName: profile?.name ?? 'Your traveler',
      session: toPublicSession(session, profile?.name ?? null, follows.length),
      token: session.shareToken,
      activityId: session.activityId,
    };
  },
});

export const clearPendingNotify = internalMutation({
  args: { sessionId: v.id('liveSessions') },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (session?.pendingNotify) await ctx.db.patch(sessionId, { pendingNotify: false });
  },
});

/** Merge a poll's facts. Missing fields are "no change"; stages never
 * regress. Detects notify-worthy transitions (flight stage reached, delay
 * crossing a 15-min bucket, gate assigned/changed) and pushes immediately —
 * these are rare and high-value, no debounce. Always re-arms the next poll. */
export const applyFlightFacts = internalMutation({
  args: {
    sessionId: v.id('liveSessions'),
    facts: v.union(
      v.null(),
      v.object({
        flightStatus: v.union(v.string(), v.null()),
        delayMinutes: v.union(v.number(), v.null()),
        gate: v.union(v.string(), v.null()),
        terminal: v.union(v.string(), v.null()),
        baggageBelt: v.union(v.string(), v.null()),
        estimatedDeparture: v.union(v.string(), v.null()),
        actualDeparture: v.union(v.string(), v.null()),
        estimatedArrival: v.union(v.string(), v.null()),
        actualArrival: v.union(v.string(), v.null()),
      }),
    ),
  },
  handler: async (ctx, { sessionId, facts }) => {
    const session = await ctx.db.get(sessionId);
    if (!session || session.status !== 'active') return;

    const now = Date.now();
    const patch: Record<string, unknown> = {
      lastCheckedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    let notifyStage: string | null = null;
    let widgetWorthy = false;

    if (facts) {
      for (const [key, value] of Object.entries(facts)) {
        if (value !== null && value !== (session as Record<string, unknown>)[key]) {
          patch[key] = value;
          widgetWorthy = true;
        }
      }

      // Auto-advance flight-driven stages; stamp their actual times.
      const stageTimes = { ...session.stageTimes };
      let currentStage = session.currentStage;
      const promote = (stage: 'departed' | 'landed', at: string) => {
        if (stageIndex(currentStage) < stageIndex(stage)) currentStage = stage;
        if (!stageTimes[stage]) stageTimes[stage] = at;
        if (!session.notifiedStages[stage]) notifyStage = stage;
      };
      if (facts.actualDeparture) promote('departed', facts.actualDeparture);
      if (facts.actualArrival) promote('landed', facts.actualArrival);
      if (currentStage !== session.currentStage) {
        patch.currentStage = currentStage;
        patch.stageTimes = stageTimes;
        widgetWorthy = true;
      }

      // Delay bucket (15 min) and gate changes push without debounce.
      const bucket = facts.delayMinutes != null ? Math.floor(facts.delayMinutes / 15) : null;
      if (bucket !== null && bucket > (session.notifiedDelayBucket ?? 0) && facts.delayMinutes! >= 30) {
        patch.notifiedDelayBucket = bucket;
        await ctx.scheduler.runAfter(0, internal.liveInternal.notifyFollowers, {
          sessionId,
          kind: 'delay',
        });
      }
      if (facts.gate && facts.gate !== session.notifiedGate) {
        patch.notifiedGate = facts.gate;
        if (session.notifiedGate !== null) {
          await ctx.scheduler.runAfter(0, internal.liveInternal.notifyFollowers, {
            sessionId,
            kind: 'gate',
          });
        }
      }
      if (notifyStage) {
        patch.notifiedStages = { ...session.notifiedStages, [notifyStage]: true };
        await ctx.scheduler.runAfter(0, internal.liveInternal.notifyFollowers, {
          sessionId,
          kind: 'stage',
        });
      }

      // Landing closes the session soon after.
      if (facts.actualArrival) {
        patch.expiresAt = new Date(now + 24 * HOUR_MS).toISOString();
      }
    }

    await ctx.db.patch(sessionId, patch as never);

    if (widgetWorthy && session.activityId) {
      await ctx.scheduler.runAfter(0, internal.liveInternal.updateActivity, { sessionId });
    }

    // Re-arm the chain from the fresh state.
    const updated = (await ctx.db.get(sessionId))!;
    const delay = nextPollDelayMs(updated, now);
    const pollScheduledId =
      delay === null
        ? null
        : await ctx.scheduler.runAfter(delay, internal.liveInternal.poll, { sessionId });
    await ctx.db.patch(sessionId, { pollScheduledId });
  },
});

export const poll = internalAction({
  args: { sessionId: v.id('liveSessions') },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.runQuery(internal.liveInternal.getSession, { sessionId });
    if (!session || session.status !== 'active') return;
    // No audience → skip the metered call but keep the chain alive.
    let facts = null;
    if (session.shareToken || session.activityId) {
      facts = await fetchFlightFacts(
        session.number,
        session.scheduledDeparture.slice(0, 10),
      ).catch(() => null);
    }
    await ctx.runMutation(internal.liveInternal.applyFlightFacts, { sessionId, facts });
  },
});

export const notifyFollowers = internalAction({
  args: { sessionId: v.id('liveSessions'), kind: v.string() },
  handler: async (ctx, { sessionId, kind }) => {
    const targets = await ctx.runQuery(internal.liveInternal.getNotifyTargets, { sessionId });
    await ctx.runMutation(internal.liveInternal.clearPendingNotify, { sessionId });
    if (!targets || targets.externalIds.length === 0) return;
    // A removed trip has no token left (journeys.push nulled it with the
    // session) and nothing to open — send that one to People instead.
    if (kind !== 'removed' && !targets.token) return;

    const s = targets.session;
    const name = targets.travelerName;
    const flight = s.number || s.carrier;
    let body: string;
    if (kind === 'removed') {
      body = `${name} removed this trip. No more updates for it.`;
    } else if (kind === 'headsUp') {
      const hours = Math.round((Date.parse(s.scheduledDeparture) - Date.now()) / 3_600_000);
      const when = hours >= 20 ? 'tomorrow' : hours > 1 ? `in ${hours}h` : 'soon';
      body = `${name} flies to ${s.toCode} ${when}. You'll get updates through travel day.`;
    } else if (kind === 'delay') {
      body = `${flight} is running ${s.delayMinutes} min late.`;
    } else if (kind === 'gate') {
      body = `${flight} now departs from gate ${s.gate}.`;
    } else {
      const copy = s.currentStage ? STAGE_PUSH_COPY[s.currentStage] : null;
      body = copy ? `${copy(name, s.toCode)}.` : `${name} is on the move.`;
    }
    await sendFollowerPush(
      targets.externalIds,
      `${flight} · ${s.fromCode} → ${s.toCode}`,
      body,
      kind === 'removed'
        ? 'https://getflyright.com/people'
        : `https://getflyright.com/t/${targets.token}`,
    );
  },
});

export const updateActivity = internalAction({
  args: { sessionId: v.id('liveSessions') },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.runQuery(internal.liveInternal.getSession, { sessionId });
    if (!session?.activityId) return;
    await pushLiveActivity(
      session.activityId,
      session.status === 'active' ? 'update' : 'end',
      buildContentState(session, Date.now()),
    );
  },
});

/** Hourly cron sweep: close expired sessions and re-arm any active session
 * whose poll chain died (failed action, deploy) — self-healing. */
export const closeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const active = await ctx.db
      .query('liveSessions')
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .collect();
    for (const session of active) {
      if (Date.parse(session.expiresAt) < now) {
        if (session.pollScheduledId) await ctx.scheduler.cancel(session.pollScheduledId).catch(() => {});
        await ctx.db.patch(session._id, {
          status: 'closed',
          shareToken: null,
          pollScheduledId: null,
          updatedAt: new Date(now).toISOString(),
        });
        if (session.activityId) {
          await ctx.scheduler.runAfter(0, internal.liveInternal.updateActivity, {
            sessionId: session._id,
          });
        }
        continue;
      }
      // Chain re-arm: an active, unexpired session with no pending poll.
      if (!session.pollScheduledId && session.number) {
        const delay = nextPollDelayMs(session, now);
        if (delay !== null) {
          const pollScheduledId = await ctx.scheduler.runAfter(
            Math.min(delay, HOUR_MS),
            internal.liveInternal.poll,
            { sessionId: session._id },
          );
          await ctx.db.patch(session._id, { pollScheduledId });
        }
      }
    }
  },
});
