import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { CIRCLE_FULL, MAX_PENDING_REQUESTS, searchKey } from './circleShared';
import {
  armHeadsUpsForOwner,
  circleFull,
  circleMembers,
  ensureCircleInvite,
  inviteUsable,
  materializeCircleFollows,
  profileFor,
  severCircle,
} from './liveHelpers';
import { toPublicSession } from './liveShared';

/** Find My-style circles: who follows my trips, whose trips I follow.
 * Invites are personal links (getflyright.com/i/<token>); accepting one adds
 * the acceptor to the owner's circle, which then rides along on every live
 * session through liveHelpers.materializeCircleFollows. */

async function requireIdentity(ctx: MutationCtx | QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Not authenticated');
  return identity;
}

async function person(ctx: QueryCtx | MutationCtx, userId: string) {
  const profile = await profileFor(ctx, userId);
  return { userId, name: profile?.name ?? 'A traveler', imageUrl: profile?.imageUrl ?? null };
}

/** Mint (or reuse) the caller's current invite link. */
export const createInvite = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    if (await circleFull(ctx, identity.subject)) throw new ConvexError(CIRCLE_FULL);
    return ensureCircleInvite(ctx, identity.subject);
  },
});

/** PUBLIC — the invite page. Only the inviter's display name leaks, and
 * only to holders of the token. */
export const inviteByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!token) return { gone: true as const };
    const invite = await ctx.db
      .query('circleInvites')
      .withIndex('by_token', (q) => q.eq('token', token))
      .unique();
    if (!inviteUsable(invite)) return { gone: true as const };
    const owner = await person(ctx, invite!.ownerId);
    const identity = await ctx.auth.getUserIdentity();
    let relation: 'self' | 'member' | 'none' = 'none';
    if (identity?.subject === invite!.ownerId) relation = 'self';
    else if (identity) {
      const row = await ctx.db
        .query('circle')
        .withIndex('by_owner_member', (q) =>
          q.eq('ownerId', invite!.ownerId).eq('memberId', identity.subject),
        )
        .unique();
      if (row) relation = 'member';
    }
    // A link minted before the owner hit the free cap (or before a lapse)
    // still resolves — the page says the circle is full instead of 404ing.
    const full = relation === 'none' && (await circleFull(ctx, invite!.ownerId));
    return { ownerName: owner.name, ownerImageUrl: owner.imageUrl, relation, full };
  },
});

/** The pending in-app invitation between two people, in one direction. */
async function pendingRequest(ctx: QueryCtx | MutationCtx, fromUserId: string, toUserId: string) {
  const row = await ctx.db
    .query('circleRequests')
    .withIndex('by_pair', (q) => q.eq('fromUserId', fromUserId).eq('toUserId', toUserId))
    .filter((q) => q.eq(q.field('status'), 'pending'))
    .unique();
  return row;
}

async function areSharing(ctx: QueryCtx | MutationCtx, ownerId: string, memberId: string) {
  return await ctx.db
    .query('circle')
    .withIndex('by_owner_member', (q) => q.eq('ownerId', ownerId).eq('memberId', memberId))
    .unique();
}

/** PUBLIC (signed in) — "add someone" search. Matches a WHOLE address or a
 * WHOLE first name, both lowercased (circleShared.searchKey): a prefix
 * search would hand anyone a directory of everyone using the app. Answers
 * with a name and a photo only — never an address, not even the one that
 * was typed, and never a hint that some other query would have matched. */
export const findPeople = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const key = searchKey(q);
    if (!key) return [];
    const me = identity.subject;

    const index = key.includes('@') ? ('by_email' as const) : ('by_search_name' as const);
    const field = index === 'by_email' ? ('email' as const) : ('searchName' as const);
    const hits = await ctx.db
      .query('profiles')
      .withIndex(index, (p) => p.eq(field, key))
      .take(10);

    const people = [];
    for (const hit of hits) {
      if (hit.userId === me) continue;
      // 'sharing' = they already follow my trips; 'invited' = my invitation
      // is out; 'incoming' = theirs is, and the People tab is where they
      // answer it.
      const relation = (await areSharing(ctx, me, hit.userId))
        ? ('sharing' as const)
        : (await pendingRequest(ctx, me, hit.userId))
          ? ('invited' as const)
          : (await pendingRequest(ctx, hit.userId, me))
            ? ('incoming' as const)
            : ('none' as const);
      people.push({
        userId: hit.userId,
        name: hit.name,
        imageUrl: hit.imageUrl ?? null,
        relation,
      });
    }
    return people;
  },
});

/** Invite someone who already has the app: same offer as the link, carried
 * by a push and a row in their People tab. Idempotent per pair — a second
 * tap returns the standing invitation rather than pushing again. */
export const requestFollow = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const identity = await requireIdentity(ctx);
    const me = identity.subject;
    if (userId === me) throw new Error('Own invite');
    const profile = await profileFor(ctx, userId);
    if (!profile) throw new Error('No such person');
    if (await areSharing(ctx, me, userId)) return { status: 'sharing' as const };

    const existing = await pendingRequest(ctx, me, userId);
    if (existing) return { status: 'pending' as const };
    // The cap is on people who follow me, and an invitation is a promise of
    // a seat — refuse it here rather than at the far end, where it would be
    // the invitee who hits the wall.
    if (await circleFull(ctx, me)) throw new ConvexError(CIRCLE_FULL);
    const outstanding = await ctx.db
      .query('circleRequests')
      .withIndex('by_from_status', (q) => q.eq('fromUserId', me).eq('status', 'pending'))
      .collect();
    if (outstanding.length >= MAX_PENDING_REQUESTS) throw new Error('Too many pending invites');

    const requestId = await ctx.db.insert('circleRequests', {
      fromUserId: me,
      toUserId: userId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      respondedAt: null,
    });
    await ctx.scheduler.runAfter(0, internal.circleInternal.notifyRequest, {
      requestId,
      kind: 'invited',
    });
    return { status: 'pending' as const };
  },
});

/** The invitee answers. Accepting runs the same join as a redeemed link, so
 * both doors open on the same room. */
export const respondToRequest = mutation({
  args: { requestId: v.id('circleRequests'), accept: v.boolean() },
  handler: async (ctx, { requestId, accept }) => {
    const identity = await requireIdentity(ctx);
    const request = await ctx.db.get(requestId);
    if (!request || request.toUserId !== identity.subject) throw new Error('Not your invite');
    if (request.status !== 'pending') return { status: request.status };

    if (accept) {
      // Throws CIRCLE_FULL if the sender's circle filled up meanwhile; the
      // invitation stays pending so it can be answered again later.
      await join(ctx, request.fromUserId, identity.subject);
      await ctx.scheduler.runAfter(0, internal.circleInternal.notifyRequest, {
        requestId,
        kind: 'accepted',
      });
    }
    await ctx.db.patch(requestId, {
      status: accept ? 'accepted' : 'declined',
      respondedAt: new Date().toISOString(),
    });
    return { status: accept ? ('accepted' as const) : ('declined' as const) };
  },
});

/** The sender takes an invitation back — gone, not declined, so they can
 * send it again. */
export const cancelRequest = mutation({
  args: { requestId: v.id('circleRequests') },
  handler: async (ctx, { requestId }) => {
    const identity = await requireIdentity(ctx);
    const request = await ctx.db.get(requestId);
    if (!request || request.fromUserId !== identity.subject) throw new Error('Not your invite');
    if (request.status === 'pending') await ctx.db.delete(requestId);
  },
});

async function join(ctx: MutationCtx, ownerId: string, memberId: string) {
  const existing = await ctx.db
    .query('circle')
    .withIndex('by_owner_member', (q) => q.eq('ownerId', ownerId).eq('memberId', memberId))
    .unique();
  if (!existing) {
    if (await circleFull(ctx, ownerId)) throw new ConvexError(CIRCLE_FULL);
    await ctx.db.insert('circle', {
      ownerId,
      memberId,
      muted: false,
      createdAt: new Date().toISOString(),
    });
  }
  // However they got here — a link or an in-app invitation — any pending
  // invitation between the two is answered now, so the People tab doesn't
  // keep offering something that already happened.
  const request = await pendingRequest(ctx, ownerId, memberId);
  if (request) {
    await ctx.db.patch(request._id, { status: 'accepted', respondedAt: new Date().toISOString() });
  }

  // Trips already live ride along immediately; upcoming ones get their
  // T−24h heads-up armed now that there is someone to tell.
  const sessions = await ctx.db
    .query('liveSessions')
    .withIndex('by_user', (q) => q.eq('userId', ownerId))
    .collect();
  for (const session of sessions) {
    if (session.status === 'active') await materializeCircleFollows(ctx, session);
  }
  await armHeadsUpsForOwner(ctx, ownerId);
}

/** Redeem an invite: the caller joins the inviter's circle. */
export const accept = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const identity = await requireIdentity(ctx);
    const invite = await ctx.db
      .query('circleInvites')
      .withIndex('by_token', (q) => q.eq('token', token))
      .unique();
    if (!inviteUsable(invite)) throw new Error('Invite expired');
    const ownerId = invite!.ownerId;
    if (ownerId === identity.subject) throw new Error('Own invite');

    await join(ctx, ownerId, identity.subject);
    await ctx.db.patch(invite!._id, { uses: invite!.uses + 1 });

    const reverse = await ctx.db
      .query('circle')
      .withIndex('by_owner_member', (q) =>
        q.eq('ownerId', identity.subject).eq('memberId', ownerId),
      )
      .unique();
    const owner = await person(ctx, ownerId);
    return { ownerId, ownerName: owner.name, sharingBack: !!reverse };
  },
});

/** "Share your trips back?" after accepting — only for someone who already
 * shares with the caller, so it never bypasses the invite step. */
export const shareBack = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const identity = await requireIdentity(ctx);
    const theyShareWithMe = await ctx.db
      .query('circle')
      .withIndex('by_owner_member', (q) => q.eq('ownerId', userId).eq('memberId', identity.subject))
      .unique();
    if (!theyShareWithMe) throw new Error('Not in their circle');
    await join(ctx, identity.subject, userId);
  },
});

/** Owner removes a follower. */
export const remove = mutation({
  args: { memberId: v.string() },
  handler: async (ctx, { memberId }) => {
    const identity = await requireIdentity(ctx);
    await severCircle(ctx, identity.subject, memberId);
  },
});

/** Follower stops following someone. */
export const leave = mutation({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const identity = await requireIdentity(ctx);
    await severCircle(ctx, ownerId, identity.subject);
  },
});

export const setMuted = mutation({
  args: { ownerId: v.string(), muted: v.boolean() },
  handler: async (ctx, { ownerId, muted }) => {
    const identity = await requireIdentity(ctx);
    const row = await ctx.db
      .query('circle')
      .withIndex('by_owner_member', (q) => q.eq('ownerId', ownerId).eq('memberId', identity.subject))
      .unique();
    if (row) await ctx.db.patch(row._id, { muted });
  },
});

/** The People tab in one reactive query: people I follow (with their live
 * or next trip) and people following me. Null while signed out. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const me = identity.subject;
    const now = Date.now();

    const myFollows = await ctx.db
      .query('follows')
      .withIndex('by_follower', (q) => q.eq('followerId', me))
      .collect();

    const following = [];
    const shares = await ctx.db
      .query('circle')
      .withIndex('by_member', (q) => q.eq('memberId', me))
      .collect();
    for (const row of shares) {
      const owner = await person(ctx, row.ownerId);

      let live = null;
      for (const f of myFollows) {
        if (f.ownerId !== row.ownerId) continue;
        const session = await ctx.db.get(f.sessionId);
        if (!session || session.status !== 'active') continue;
        const follows = await ctx.db
          .query('follows')
          .withIndex('by_session', (q) => q.eq('sessionId', session._id))
          .collect();
        live = {
          token: session.shareToken,
          session: toPublicSession(session, owner.name, follows.length),
        };
        break;
      }

      // Next upcoming trip — only the public-safe flight snapshot, same
      // fields a live session exposes. Never naturalKey or prices.
      let next = null;
      if (!live) {
        const journeys = await ctx.db
          .query('journeys')
          .withIndex('by_user', (q) => q.eq('userId', row.ownerId))
          .collect();
        for (const j of journeys) {
          if (j.deletedAt) continue;
          const dep = Date.parse(j.scheduledDeparture);
          if (Number.isNaN(dep) || dep < now) continue;
          if (!next || dep < Date.parse(next.scheduledDeparture)) {
            next = {
              carrier: j.carrier,
              number: j.number,
              fromCode: j.fromCode,
              toCode: j.toCode,
              scheduledDeparture: j.scheduledDeparture,
              scheduledArrival: j.scheduledArrival,
            };
          }
        }
      }
      following.push({ ...owner, muted: row.muted, since: row.createdAt, live, next });
    }

    const followers = [];
    for (const row of await circleMembers(ctx, me)) {
      followers.push({ ...(await person(ctx, row.memberId)), since: row.createdAt });
    }

    // In-app invitations still waiting: theirs to answer, and mine to watch.
    const incoming = [];
    for (const r of await ctx.db
      .query('circleRequests')
      .withIndex('by_to_status', (q) => q.eq('toUserId', me).eq('status', 'pending'))
      .collect()) {
      incoming.push({ id: r._id, since: r.createdAt, ...(await person(ctx, r.fromUserId)) });
    }
    const outgoing = [];
    for (const r of await ctx.db
      .query('circleRequests')
      .withIndex('by_from_status', (q) => q.eq('fromUserId', me).eq('status', 'pending'))
      .collect()) {
      outgoing.push({ id: r._id, since: r.createdAt, ...(await person(ctx, r.toUserId)) });
    }

    following.sort((a, b) => (a.live ? 0 : 1) - (b.live ? 0 : 1) || a.name.localeCompare(b.name));
    followers.sort((a, b) => a.name.localeCompare(b.name));
    incoming.sort((a, b) => b.since.localeCompare(a.since));
    outgoing.sort((a, b) => b.since.localeCompare(a.since));
    // Server truth for the cap — the client's SDK entitlement can lead it
    // (purchase just made) but never the other way round.
    return { following, followers, incoming, outgoing, full: await circleFull(ctx, me) };
  },
});
