import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { maySee } from './audience';
import { FREE_CIRCLE_SIZE } from './circleShared';
import { isPro } from './entitlements';
import { makeToken, nextPollDelayMs, sessionExpiryFor } from './liveShared';
import { poolStretchFactor } from './provider';

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
  const now = Date.now();
  const base = nextPollDelayMs(session, now);
  // A thin monthly pool stretches the cadence rather than killing the chain.
  const delay = base === null ? null : base * (await poolStretchFactor(ctx, now));
  const pollScheduledId =
    delay === null
      ? null
      : await ctx.scheduler.runAfter(delay, internal.liveInternal.poll, { sessionId: session._id });
  await ctx.db.patch(session._id, { pollScheduledId });
}

/** Who in the owner's circle may see this trip: everyone, only the members
 * flagged close for a close-circle trip, nobody for a private one. */
export async function audienceFor(
  ctx: MutationCtx | QueryCtx,
  journey: Pick<Doc<'journeys'>, 'userId' | 'hiddenFromCircle' | 'privateTrip'>,
) {
  const members = await circleMembers(ctx, journey.userId);
  return members.filter((m) => maySee(journey, !!m.close));
}

/** Whether this member may see the owner's close-circle trips. */
export async function isCloseMember(ctx: MutationCtx | QueryCtx, ownerId: string, memberId: string) {
  const row = await ctx.db
    .query('circle')
    .withIndex('by_owner_member', (q) => q.eq('ownerId', ownerId).eq('memberId', memberId))
    .unique();
  return !!row?.close;
}

/** Every circle member who may see the trip becomes a follower of this
 * session (idempotent). Circle-level mute is honored at send time
 * (getNotifyTargets), so the follows row itself stays unmuted and the member
 * can still open the trip. A close-circle trip folds in the close members
 * only. */
export async function materializeCircleFollows(ctx: MutationCtx, session: Doc<'liveSessions'>) {
  const journey = await journeyForKey(ctx, session.userId, session.naturalKey);
  const members = journey
    ? await audienceFor(ctx, journey)
    : await circleMembers(ctx, session.userId);
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

/** The trip just went close-circle-only: everyone following any of its
 * active sessions who isn't a close member is dropped — the rest of the
 * circle and link-holders alike — so the People tab, the live page and the
 * next push forget it for them. */
export async function hideSessionsFromCircle(ctx: MutationCtx, userId: string, naturalKey: string) {
  const sessions = await ctx.db
    .query('liveSessions')
    .withIndex('by_user_key', (q) => q.eq('userId', userId).eq('naturalKey', naturalKey))
    .collect();
  const active = sessions.filter((s) => s.status === 'active');
  if (!active.length) return;
  const journey = await journeyForKey(ctx, userId, naturalKey);
  // Whoever the trip still admits keeps their follow; a private trip admits
  // nobody, so every follower goes — link-holders included.
  const keep = new Set(
    journey ? (await audienceFor(ctx, journey)).map((m) => m.memberId) : [],
  );
  for (const session of active) {
    const follows = await ctx.db
      .query('follows')
      .withIndex('by_session', (q) => q.eq('sessionId', session._id))
      .collect();
    for (const f of follows) {
      if (!keep.has(f.followerId)) await ctx.db.delete(f._id);
    }
  }
}

/** A member moved into or out of the close circle: their access to the
 * owner's close-circle trips follows. In: every active session takes them
 * aboard and the heads-ups those trips lacked get armed. Out: they stop
 * following the sessions of trips they may no longer see. */
export async function syncCloseAccess(ctx: MutationCtx, ownerId: string, memberId: string) {
  const sessions = await ctx.db
    .query('liveSessions')
    .withIndex('by_user', (q) => q.eq('userId', ownerId))
    .collect();
  const close = await isCloseMember(ctx, ownerId, memberId);
  for (const session of sessions) {
    if (session.status !== 'active') continue;
    if (close) {
      await materializeCircleFollows(ctx, session);
      continue;
    }
    const journey = await journeyForKey(ctx, ownerId, session.naturalKey);
    if (!journey || maySee(journey, false)) continue;
    const row = await ctx.db
      .query('follows')
      .withIndex('by_session_follower', (q) =>
        q.eq('sessionId', session._id).eq('followerId', memberId),
      )
      .unique();
    if (row) await ctx.db.delete(row._id);
  }
  if (close) await armHeadsUpsForOwner(ctx, ownerId);
}

/** Create the live session for a journey: flight snapshot from the mirror,
 * a fresh share token, the circle folded in as followers, and the poll chain
 * armed for tracked flights. Callers check there is no active session first.
 *
 * Stamps handed in at creation are backfill, not news: the device may be
 * uploading a trip that already flew (a reinstall, or a status refresh that
 * folds actual departure/arrival into an old trip's timeline). They seed
 * notifiedStages so nobody's circle hears "landed in FRA" about last week. */
export async function createSession(
  ctx: MutationCtx,
  journey: Doc<'journeys'>,
  init: { stage: string | null; stamps: Record<string, string>; activityId: string | null },
) {
  const now = new Date().toISOString();
  const expiresAt = new Date(
    sessionExpiryFor(journey.scheduledArrival, Date.now(), journey.toCode),
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
    activityStartedAt: init.activityId ? now : null,
    shareToken: makeToken(),
    expiresAt,
    notifiedStages: Object.fromEntries(Object.keys(init.stamps).map((k) => [k, true])),
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
    (await audienceFor(ctx, journey)).length
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

const INVITE_TTL_MS = 7 * 24 * 3_600_000;
const INVITE_MAX_USES = 10;

/** Free accounts share with FREE_CIRCLE_SIZE people; Pro is unlimited. The
 * SDK-side entitlement never reaches here — only the webhook mirror counts,
 * so a fresh purchase gates until RC's event lands (seconds, normally). */
export async function circleFull(ctx: QueryCtx | MutationCtx, ownerId: string) {
  const members = await circleMembers(ctx, ownerId);
  return members.length >= FREE_CIRCLE_SIZE && !(await isPro(ctx, ownerId));
}

export function inviteUsable(invite: { uses: number; expiresAt: string } | null) {
  return (
    !!invite && invite.uses < INVITE_MAX_USES && Date.parse(invite.expiresAt) > Date.now()
  );
}

/** The owner's current invite link — reused while it has uses and time left,
 * otherwise minted fresh (dead invites are garbage, nobody can redeem them).
 * Callers check circleFull first; a full circle has no business inviting.
 * Invite tokens share the session-token recipe (22-char base62). */
export async function ensureCircleInvite(ctx: MutationCtx, ownerId: string) {
  const existing = await ctx.db
    .query('circleInvites')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .collect();
  const live = existing.find(inviteUsable);
  if (live) return { token: live.token, expiresAt: live.expiresAt };
  for (const row of existing) await ctx.db.delete(row._id);
  const now = Date.now();
  const token = makeToken();
  const expiresAt = new Date(now + INVITE_TTL_MS).toISOString();
  await ctx.db.insert('circleInvites', {
    ownerId,
    token,
    uses: 0,
    expiresAt,
    createdAt: new Date(now).toISOString(),
  });
  return { token, expiresAt };
}
