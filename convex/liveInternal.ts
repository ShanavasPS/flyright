import { flightDay } from './airportZones';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { journeyForKey } from './liveHelpers';
import {
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import { fetchFlightFacts } from './flightData';
import {
  activityAttributes,
  buildContentState,
  clockEndsAt,
  clockStaleAt,
  makeToken,
  nextPollDelayMs,
  shouldStartActivity,
  stageIndex,
  shouldNotifyFollowers,
  STAGE_PUSH_COPY,
  toPublicSession,
} from './liveShared';
import { pushLiveActivity, sendFollowerPush, startLiveActivity } from './onesignal';
import { poolStretchFactor } from './provider';

/** Internal half of the live sessions: the self-rescheduling poll chain,
 * flight-fact merging, follower push fan-out, and Live Activity updates. */

const HOUR_MS = 3_600_000;

export const getSession = internalQuery({
  args: { sessionId: v.id('liveSessions') },
  handler: (ctx, { sessionId }) => ctx.db.get(sessionId),
});

/** What the traveller's OWN Lock Screen card knows beyond the session: the
 * seat from their journey. Never used for a follower's card. */
export const ownCardExtras = internalQuery({
  args: { sessionId: v.id('liveSessions') },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return { seat: null };
    const journey = await journeyForKey(ctx, session.userId, session.naturalKey);
    return { seat: journey?.seat ?? null };
  },
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
      expiresAt: session.expiresAt,
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
        checkInDesk: v.optional(v.union(v.string(), v.null())),
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
    await ctx.scheduler.runAfter(0, internal.followerActivities.syncSession, { sessionId });

    // iOS ends a Live Activity eight hours in; the device can only restart
    // one while open. The chain does it from here: mint the id (the device
    // adopts it by the `<journeyId>~` prefix on its next reconcile), stamp
    // the attempt, and push-to-start. A failed start clears the id again.
    let updated = (await ctx.db.get(sessionId))!;
    if (shouldStartActivity(updated, now)) {
      await ctx.db.patch(sessionId, {
        activityId: `${updated.naturalKey}~srv${makeToken().slice(0, 12)}`,
        activityStartedAt: new Date(now).toISOString(),
      });
      await ctx.scheduler.runAfter(0, internal.liveInternal.startActivity, { sessionId });
    } else if (widgetWorthy && session.activityId) {
      await ctx.scheduler.runAfter(0, internal.liveInternal.updateActivity, { sessionId });
    }
    await armClockRefresh(ctx, sessionId, now);

    // Re-arm the chain from the fresh state.
    updated = (await ctx.db.get(sessionId))!;
    const base = nextPollDelayMs(updated, now);
    const delay = base === null ? null : base * (await poolStretchFactor(ctx, now));
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
    if (session.shareToken || session.activityId || await ctx.runQuery(internal.followerActivities.hasAudience, { sessionId })) {
      facts = await fetchFlightFacts(
        ctx,
        session.number,
        // The flight's local date at its origin — see airportZones.flightDay.
        flightDay(session.scheduledDeparture, session.fromCode),
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
    // Stale trips never reach a circle — see shouldNotifyFollowers.
    if (
      !shouldNotifyFollowers(
        {
          kind,
          currentStage: targets.session.currentStage,
          stageTimes: targets.session.stageTimes,
          expiresAt: targets.expiresAt,
        },
        Date.now(),
      )
    ) {
      return;
    }

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

export const startActivity = internalAction({
  args: { sessionId: v.id('liveSessions') },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.runQuery(internal.liveInternal.getSession, { sessionId });
    if (!session?.activityId || session.status !== 'active') return;
    const own = await ctx.runQuery(internal.liveInternal.ownCardExtras, { sessionId });
    const state = buildContentState(session, Date.now(), own);
    const started = await startLiveActivity(
      session.userId,
      session.activityId,
      activityAttributes(session),
      state,
      String((activityAttributes(session) as { title: string }).title),
      String(state.headline ?? 'Travel day'),
    );
    if (!started) {
      await ctx.runMutation(internal.liveInternal.clearActivity, {
        sessionId,
        activityId: session.activityId,
      });
    }
  },
});

/** Undo a minted id whose start push went nowhere; the attempt stamp stays
 * so the chain doesn't retry every poll. */
export const clearActivity = internalMutation({
  args: { sessionId: v.id('liveSessions'), activityId: v.string() },
  handler: async (ctx, { sessionId, activityId }) => {
    const session = await ctx.db.get(sessionId);
    if (session?.activityId === activityId) await ctx.db.patch(sessionId, { activityId: null });
  },
});

/** Aim one extra push at the moment the card's clock stops being right.
 *
 * `clockStaleAt` explains which moment and why the card cannot fix itself:
 * its view is archived when sent and never re-decides anything, so the only
 * repair is content that arrives then. Without this the lock screen and the
 * Dynamic Island draw a mangled countdown — ":59:-" — from the instant the
 * flight goes until the next poll, which is minutes.
 *
 * Replaces its own earlier job every poll, so the deadline follows a delay. */
async function armClockRefresh(
  ctx: { db: MutationCtx['db']; scheduler: MutationCtx['scheduler'] },
  sessionId: Id<'liveSessions'>,
  now: number,
): Promise<void> {
  const session = await ctx.db.get(sessionId);
  if (!session) return;
  const previous = session.clockScheduledId ?? null;
  const end = session.activityId && session.status === 'active' ? clockEndsAt(session, now) : null;
  const breaks = clockStaleAt(end, now);
  // A second past it: the push must land with the moment already behind it,
  // so the content it carries is the one the card should have been showing.
  const at = breaks === null ? null : Math.max(breaks + 1_000, now + 1_000);
  if (previous) await ctx.scheduler.cancel(previous).catch(() => {});
  const clockScheduledId =
    at === null
      ? null
      : await ctx.scheduler.runAt(at, internal.liveInternal.updateActivity, { sessionId });
  await ctx.db.patch(sessionId, { clockScheduledId });
}

export const updateActivity = internalAction({
  args: { sessionId: v.id('liveSessions') },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.runQuery(internal.liveInternal.getSession, { sessionId });
    if (!session?.activityId) return;
    const own = await ctx.runQuery(internal.liveInternal.ownCardExtras, { sessionId });
    await pushLiveActivity(
      session.activityId,
      session.status === 'active' ? 'update' : 'end',
      buildContentState(session, Date.now(), own),
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
      // Recover follower wakeups after a failed scheduled job as well.
      await ctx.scheduler.runAfter(0, internal.followerActivities.syncSession, { sessionId: session._id });
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
