import { v } from 'convex/values';

import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import {
  armHeadsUpsForOwner,
  circleMembers,
  makeInviteToken,
  materializeCircleFollows,
  profileFor,
  severCircle,
} from './liveHelpers';
import { toPublicSession } from './liveShared';

/** Find My-style circles: who follows my trips, whose trips I follow.
 * Invites are personal links (getflyright.com/i/<token>); accepting one adds
 * the acceptor to the owner's circle, which then rides along on every live
 * session through liveHelpers.materializeCircleFollows. */

const INVITE_TTL_MS = 7 * 24 * 3_600_000;
const INVITE_MAX_USES = 10;

async function requireIdentity(ctx: MutationCtx | QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Not authenticated');
  return identity;
}

async function person(ctx: QueryCtx | MutationCtx, userId: string) {
  const profile = await profileFor(ctx, userId);
  return { userId, name: profile?.name ?? 'A traveler', imageUrl: profile?.imageUrl ?? null };
}

function inviteUsable(invite: { uses: number; expiresAt: string } | null) {
  return (
    !!invite && invite.uses < INVITE_MAX_USES && Date.parse(invite.expiresAt) > Date.now()
  );
}

/** Mint (or reuse) the caller's current invite link. */
export const createInvite = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const existing = await ctx.db
      .query('circleInvites')
      .withIndex('by_owner', (q) => q.eq('ownerId', identity.subject))
      .collect();
    const live = existing.find(inviteUsable);
    if (live) return { token: live.token, expiresAt: live.expiresAt };
    // Dead invites are garbage — nobody can redeem them anymore.
    for (const row of existing) await ctx.db.delete(row._id);
    const now = Date.now();
    const token = makeInviteToken();
    const expiresAt = new Date(now + INVITE_TTL_MS).toISOString();
    await ctx.db.insert('circleInvites', {
      ownerId: identity.subject,
      token,
      uses: 0,
      expiresAt,
      createdAt: new Date(now).toISOString(),
    });
    return { token, expiresAt };
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
    return { ownerName: owner.name, ownerImageUrl: owner.imageUrl, relation };
  },
});

async function join(ctx: MutationCtx, ownerId: string, memberId: string) {
  const existing = await ctx.db
    .query('circle')
    .withIndex('by_owner_member', (q) => q.eq('ownerId', ownerId).eq('memberId', memberId))
    .unique();
  if (!existing) {
    await ctx.db.insert('circle', {
      ownerId,
      memberId,
      muted: false,
      createdAt: new Date().toISOString(),
    });
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

    following.sort((a, b) => (a.live ? 0 : 1) - (b.live ? 0 : 1) || a.name.localeCompare(b.name));
    followers.sort((a, b) => a.name.localeCompare(b.name));
    return { following, followers };
  },
});
