import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { makeToken, nextPollDelayMs } from './liveShared';

/** ctx-bound helpers shared by the public live API, the circle API and the
 * scheduled heads-up. Pure helpers stay in liveShared.ts. */

const HOUR_MS = 3_600_000;

export async function activeSessionForKey(
  ctx: MutationCtx | QueryCtx,
  userId: string,
  naturalKey: string,
) {
  const sessions = await ctx.db
    .query('liveSessions')
    .withIndex('by_user_key', (q) => q.eq('userId', userId).eq('naturalKey', naturalKey))
    .collect();
  return sessions.find((s) => s.status === 'active') ?? null;
}

export async function followerCount(ctx: MutationCtx | QueryCtx, sessionId: Id<'liveSessions'>) {
  const rows = await ctx.db
    .query('follows')
    .withIndex('by_session', (q) => q.eq('sessionId', sessionId))
    .collect();
  return rows.length;
}

export async function profileFor(ctx: MutationCtx | QueryCtx, userId: string) {
  return ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
}

export async function travelerName(ctx: MutationCtx | QueryCtx, userId: string) {
  return (await profileFor(ctx, userId))?.name ?? null;
}

export async function circleMembers(ctx: MutationCtx | QueryCtx, ownerId: string) {
  return ctx.db
    .query('circle')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .collect();
}

/** (Re)arm the self-rescheduling poll chain for a session. */
export async function schedulePoll(ctx: MutationCtx, session: Doc<'liveSessions'>) {
  if (session.pollScheduledId) {
    await ctx.scheduler.cancel(session.pollScheduledId).catch(() => {});
  }
  const delay = nextPollDelayMs(session, Date.now());
  const pollScheduledId =
    delay === null
      ? null
      : await ctx.scheduler.runAfter(delay, internal.liveInternal.poll, { sessionId: session._id });
  await ctx.db.patch(session._id, { pollScheduledId });
}

/** Every circle member becomes a follower of this session (idempotent).
 * Circle-level mute is honored at send time (getNotifyTargets), so the
 * follows row itself stays unmuted and the member can still open the trip. */
export async function materializeCircleFollows(ctx: MutationCtx, session: Doc<'liveSessions'>) {
  const members = await circleMembers(ctx, session.userId);
  if (!members.length) return;
  const now = new Date().toISOString();
  for (const member of members) {
    const existing = await ctx.db
      .query('follows')
      .withIndex('by_session_follower', (q) =>
        q.eq('sessionId', session._id).eq('followerId', member.memberId),
      )
      .unique();
    if (existing) continue;
    await ctx.db.insert('follows', {
      sessionId: session._id,
      ownerId: session.userId,
      followerId: member.memberId,
      muted: false,
      createdAt: now,
    });
  }
}

/** Create the live session for a journey: flight snapshot from the mirror,
 * a fresh share token, the circle folded in as followers, and the poll chain
 * armed for tracked flights. Callers check there is no active session first. */
export async function createSession(
  ctx: MutationCtx,
  journey: Doc<'journeys'>,
  init: { stage: string | null; stamps: Record<string, string>; activityId: string | null },
) {
  const now = new Date().toISOString();
  const arrival = Date.parse(journey.scheduledArrival);
  const expiresAt = new Date(
    (Number.isNaN(arrival) ? Date.now() : arrival) + 48 * HOUR_MS,
  ).toISOString();

  const sessionId = await ctx.db.insert('liveSessions', {
    userId: journey.userId,
    naturalKey: journey.naturalKey,
    status: 'active',
    carrier: journey.carrier,
    number: journey.number,
    fromCode: journey.fromCode,
    toCode: journey.toCode,
    scheduledDeparture: journey.scheduledDeparture,
    scheduledArrival: journey.scheduledArrival,
    currentStage: init.stage,
    stageTimes: init.stamps,
    flightStatus: null,
    delayMinutes: null,
    gate: null,
    terminal: null,
    baggageBelt: null,
    estimatedDeparture: null,
    actualDeparture: null,
    estimatedArrival: null,
    actualArrival: null,
    lastCheckedAt: null,
    activityId: init.activityId,
    shareToken: makeToken(),
    expiresAt,
    notifiedStages: {},
    notifiedDelayBucket: null,
    notifiedGate: null,
    pendingNotify: false,
    pollScheduledId: null,
    createdAt: now,
    updatedAt: now,
  });

  const session = (await ctx.db.get(sessionId))!;
  await materializeCircleFollows(ctx, session);
  if (journey.source === 'lookup' && journey.number) await schedulePoll(ctx, session);
  return session;
}

/** Owner-scoped journey lookup by natural key; null for missing/deleted. */
export async function journeyForKey(ctx: MutationCtx | QueryCtx, userId: string, naturalKey: string) {
  const journey = await ctx.db
    .query('journeys')
    .withIndex('by_user_key', (q) => q.eq('userId', userId).eq('naturalKey', naturalKey))
    .unique();
  return journey && !journey.deletedAt ? journey : null;
}

/** Circle members who share with `userId` and members `userId` shares with,
 * removed together with every follows row between the pair. */
export async function severCircle(ctx: MutationCtx, ownerId: string, memberId: string) {
  const row = await ctx.db
    .query('circle')
    .withIndex('by_owner_member', (q) => q.eq('ownerId', ownerId).eq('memberId', memberId))
    .unique();
  if (row) await ctx.db.delete(row._id);
  const follows = await ctx.db
    .query('follows')
    .withIndex('by_follower', (q) => q.eq('followerId', memberId))
    .collect();
  for (const f of follows) {
    if (f.ownerId === ownerId) await ctx.db.delete(f._id);
  }
}

const DAY_MS = 24 * HOUR_MS;

/** (Re)arm the T−24h circle heads-up for a journey. Cancels any pending one
 * first, so departure edits move the alarm instead of duplicating it. No
 * circle → nothing armed (circle.accept arms the owner's trips later). */
export async function armHeadsUp(ctx: MutationCtx, journey: Doc<'journeys'>) {
  if (journey.headsUpScheduledId) {
    await ctx.scheduler.cancel(journey.headsUpScheduledId).catch(() => {});
  }
  let headsUpScheduledId: Id<'_scheduled_functions'> | null = null;
  const dep = Date.parse(journey.scheduledDeparture);
  const now = Date.now();
  if (
    !journey.deletedAt &&
    !journey.headsUpSentAt &&
    !Number.isNaN(dep) &&
    dep > now &&
    (await circleMembers(ctx, journey.userId)).length
  ) {
    headsUpScheduledId = await ctx.scheduler.runAt(
      Math.max(now, dep - DAY_MS),
      internal.circleInternal.headsUp,
      { journeyId: journey._id },
    );
  }
  if (headsUpScheduledId !== (journey.headsUpScheduledId ?? null)) {
    await ctx.db.patch(journey._id, { headsUpScheduledId });
  }
}

/** A member just joined: every upcoming trip of the owner that has no
 * heads-up yet gets one. */
export async function armHeadsUpsForOwner(ctx: MutationCtx, ownerId: string) {
  const now = Date.now();
  const journeys = await ctx.db
    .query('journeys')
    .withIndex('by_user', (q) => q.eq('userId', ownerId))
    .collect();
  for (const journey of journeys) {
    if (journey.deletedAt || journey.headsUpSentAt || journey.headsUpScheduledId) continue;
    const dep = Date.parse(journey.scheduledDeparture);
    if (Number.isNaN(dep) || dep <= now) continue;
    await armHeadsUp(ctx, journey);
  }
}

/** Invite tokens share the session-token recipe (22-char base62). */
export const makeInviteToken = makeToken;
