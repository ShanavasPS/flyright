import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { CIRCLE_FULL, MAX_PENDING_REQUESTS, searchKey } from './circleShared';
import {
  armHeadsUpsForOwner,
  circleFull,
  circleMembers,
  ensureCircleInvite,
  inviteUsable,
  journeyForKey,
  materializeCircleFollows,
  profileFor,
  severCircle,
  syncCloseAccess,
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

async function personCard(ctx: QueryCtx | MutationCtx, userId: string) {
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
    const owner = await personCard(ctx, invite!.ownerId);
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

/** The public-safe shape of one of somebody else's trips: the same fields a
 * live session already exposes to a follower, plus the id to open it by.
 * Never the natural key, the notes, the photos or anything a claim knows. */
function publicTrip(j: Doc<'journeys'>) {
  return {
    journeyId: j._id,
    carrier: j.carrier,
    number: j.number,
    fromCode: j.fromCode,
    toCode: j.toCode,
    scheduledDeparture: j.scheduledDeparture,
    scheduledArrival: j.scheduledArrival,
  };
}

/** How many flown trips a follower is shown. Their circle is family, not an
 * audience, but a journal is still years long — this is a profile, not an
 * archive. Kept short deliberately: the page ends in the follower's own two
 * controls, and those must not sit below a year of somebody else's flights. */
const PAST_TRIPS_SHOWN = 10;

/** My active session for one of this owner's trips, if I'm following one. */
async function liveFor(ctx: QueryCtx, me: string, ownerId: string) {
  const follows = await ctx.db
    .query('follows')
    .withIndex('by_follower', (q) => q.eq('followerId', me))
    .collect();
  for (const f of follows) {
    if (f.ownerId !== ownerId) continue;
    const session = await ctx.db.get(f.sessionId);
    if (!session || session.status !== 'active') continue;
    return session;
  }
  return null;
}

/** The owner's travel as one member sees it: the trips they may open, the
 * live session among them, and totals that count every trip. `seesHidden`
 * is the close-circle tier; `session` is the live session the viewer is
 * following (or, for a preview, the owner's current one). Shared by the
 * person page and the owner's own "how others see you" preview, so the
 * preview can never drift from what a member is actually shown. */
async function travelOf(
  ctx: QueryCtx,
  ownerId: string,
  seesHidden: boolean,
  session: Doc<'liveSessions'> | null,
) {
  const now = Date.now();
  const upcoming: Doc<'journeys'>[] = [];
  const past: Doc<'journeys'>[] = [];
  let hiddenAhead = 0;
  let hiddenFlown = 0;
  let liveJourneyId: Id<'journeys'> | null = null;
  const journeys = await ctx.db
    .query('journeys')
    .withIndex('by_user', (q) => q.eq('userId', ownerId))
    .collect();
  for (const j of journeys) {
    if (j.deletedAt) continue;
    const dep = Date.parse(j.scheduledDeparture);
    if (Number.isNaN(dep)) continue;
    if (j.hiddenFromCircle && !seesHidden) {
      // Close-circle trips are for close members. Everyone else still sees
      // them in the totals — a profile's "21 trips flown" is the truth, not
      // the list of what they may open.
      if (dep >= now) hiddenAhead++;
      else hiddenFlown++;
      continue;
    }
    if (session && j.naturalKey === session.naturalKey) liveJourneyId = j._id;
    (dep >= now ? upcoming : past).push(j);
  }
  // Soonest first ahead, most recent first behind — a profile reads
  // outward from today in both directions.
  upcoming.sort((a, b) => Date.parse(a.scheduledDeparture) - Date.parse(b.scheduledDeparture));
  past.sort((a, b) => Date.parse(b.scheduledDeparture) - Date.parse(a.scheduledDeparture));
  const shownPast = past.slice(0, PAST_TRIPS_SHOWN);
  return {
    liveJourneyId,
    upcoming: upcoming.map(publicTrip),
    past: shownPast.map(publicTrip),
    // Totals count every trip; the lists above hold what I may open.
    ahead: upcoming.length + hiddenAhead,
    flown: past.length + hiddenFlown,
    hiddenAhead,
    hiddenFlown,
    /** Listed trips that are close-circle only — for the owner's preview. */
    hiddenIds: [...upcoming, ...shownPast].filter((j) => j.hiddenFromCircle).map((j) => j._id),
  };
}

async function liveCard(ctx: QueryCtx, session: Doc<'liveSessions'> | null, name: string | null) {
  if (!session) return null;
  const follows = await ctx.db
    .query('follows')
    .withIndex('by_session', (q) => q.eq('sessionId', session._id))
    .collect();
  return { token: session.shareToken, session: toPublicSession(session, name, follows.length) };
}

/** PUBLIC (signed in) — one person in my circle, and what I may see of them.
 *
 * The relationship decides the content, in both directions independently:
 * `theyShare` (I'm in their circle) is what unlocks their trips, `iShare`
 * (they're in mine) is what makes "remove" mine to do. Someone I merely
 * follow gets a page of their travel; someone who merely follows me gets a
 * page with one button on it. Reciprocal pairs get both.
 *
 * A follower reads and does nothing else. There is no mutation here that
 * touches a trip, because a follower has no business changing one — mute and
 * leave (circle.setMuted / circle.leave) are the whole of what they own. */
export const person = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const me = identity.subject;
    if (userId === me) return { gone: true as const };

    const theirs = await areSharing(ctx, userId, me);
    const mine = await areSharing(ctx, me, userId);
    if (!theirs && !mine) return { gone: true as const };

    const who = await personCard(ctx, userId);

    if (theirs) {
      const session = await liveFor(ctx, me, userId);
      const { hiddenAhead: _a, hiddenFlown: _f, hiddenIds: _h, ...travel } = await travelOf(
        ctx,
        userId,
        !!theirs.close,
        session,
      );
      return {
        ...who,
        theyShare: true as const,
        iShare: !!mine,
        muted: !!theirs.muted,
        /** I'm in their close circle. */
        close: !!theirs.close,
        /** They're in mine (meaningful with iShare). */
        closeMember: !!mine?.close,
        since: theirs.createdAt,
        followsMeSince: mine?.createdAt ?? null,
        live: await liveCard(ctx, session, who.name),
        ...travel,
      };
    }

    return {
      ...who,
      theyShare: false as const,
      iShare: true as const,
      muted: false,
      close: false,
      closeMember: !!mine!.close,
      since: null,
      followsMeSince: mine!.createdAt,
      live: null,
      liveJourneyId: null,
      upcoming: [],
      past: [],
      ahead: 0,
      flown: 0,
    };
  },
});

/** PUBLIC (signed in) — my own travel as a member of my circle sees it: the
 * "how others see you" preview. Built by the same travelOf as the person
 * page, so it is a rendering of the truth, not a mock of it. `memberId`
 * previews as that follower (their tier); otherwise `close` picks the tier
 * outright, for a circle with nobody in it yet. The owner-only extras —
 * which listed trips are close-circle only, and how many are missing from
 * this tier's view — let the preview mark and explain what a member is not
 * told. */
export const previewMe = query({
  args: { memberId: v.optional(v.string()), close: v.optional(v.boolean()) },
  handler: async (ctx, { memberId, close }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const me = identity.subject;

    const members = await circleMembers(ctx, me);
    const followers = [];
    for (const row of members) {
      followers.push({ ...(await personCard(ctx, row.memberId)), close: !!row.close, since: row.createdAt });
    }
    const member = memberId ? followers.find((f) => f.userId === memberId) ?? null : null;
    const seesHidden = member ? member.close : !!close;

    // The owner's session in flight right now, if this tier may see its trip.
    const sessions = await ctx.db
      .query('liveSessions')
      .withIndex('by_user', (q) => q.eq('userId', me))
      .collect();
    let session: Doc<'liveSessions'> | null = null;
    for (const s of sessions) {
      if (s.status !== 'active') continue;
      const journey = await journeyForKey(ctx, me, s.naturalKey);
      if (!journey || (journey.hiddenFromCircle && !seesHidden)) continue;
      session = s;
      break;
    }

    const who = await personCard(ctx, me);
    return {
      ...who,
      member,
      close: seesHidden,
      followers,
      live: await liveCard(ctx, session, who.name),
      ...(await travelOf(ctx, me, seesHidden, session)),
    };
  },
});

/** PUBLIC (signed in) — one trip of somebody whose circle I'm in, read-only.
 * Works before a live session exists, which is the whole point: a trip three
 * months out has no session and is still the thing a follower wants to open.
 * When one IS live, its facts ride along so the same screen shows the
 * timeline instead of just a schedule. */
export const trip = query({
  args: { ownerId: v.string(), journeyId: v.id('journeys') },
  handler: async (ctx, { ownerId, journeyId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const me = identity.subject;
    const membership = await areSharing(ctx, ownerId, me);
    if (!membership) return { gone: true as const };

    const journey = await ctx.db.get(journeyId);
    // The id is the caller's to supply, so it is checked against the owner
    // they claimed rather than trusted: a journey id alone opens nothing.
    // A close-circle trip opens for close members only.
    if (
      !journey ||
      journey.userId !== ownerId ||
      journey.deletedAt ||
      (journey.hiddenFromCircle && !membership.close)
    ) {
      return { gone: true as const };
    }

    const who = await personCard(ctx, ownerId);
    const session = await liveFor(ctx, me, ownerId);
    const liveHere = session && session.naturalKey === journey.naturalKey ? session : null;
    return {
      owner: who,
      trip: publicTrip(journey),
      token: liveHere?.shareToken ?? null,
      session: liveHere
        ? toPublicSession(
            liveHere,
            who.name,
            (
              await ctx.db
                .query('follows')
                .withIndex('by_session', (q) => q.eq('sessionId', liveHere._id))
                .collect()
            ).length,
          )
        : null,
    };
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
    const owner = await personCard(ctx, ownerId);
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

/** Owner moves a follower into or out of the close circle — the people who
 * also see the trips kept from everyone else. */
export const setClose = mutation({
  args: { memberId: v.string(), close: v.boolean() },
  handler: async (ctx, { memberId, close }) => {
    const identity = await requireIdentity(ctx);
    const row = await ctx.db
      .query('circle')
      .withIndex('by_owner_member', (q) =>
        q.eq('ownerId', identity.subject).eq('memberId', memberId),
      )
      .unique();
    if (!row) throw new Error('Not in your circle');
    if (!!row.close === close) return;
    await ctx.db.patch(row._id, { close });
    await syncCloseAccess(ctx, identity.subject, memberId);
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
      const owner = await personCard(ctx, row.ownerId);

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
          if (j.deletedAt || (j.hiddenFromCircle && !row.close)) continue;
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
      following.push({
        ...owner,
        muted: row.muted,
        close: !!row.close,
        since: row.createdAt,
        live,
        next,
      });
    }

    const followers = [];
    for (const row of await circleMembers(ctx, me)) {
      followers.push({
        ...(await personCard(ctx, row.memberId)),
        close: !!row.close,
        since: row.createdAt,
      });
    }

    // In-app invitations still waiting: theirs to answer, and mine to watch.
    const incoming = [];
    for (const r of await ctx.db
      .query('circleRequests')
      .withIndex('by_to_status', (q) => q.eq('toUserId', me).eq('status', 'pending'))
      .collect()) {
      incoming.push({ id: r._id, since: r.createdAt, ...(await personCard(ctx, r.fromUserId)) });
    }
    const outgoing = [];
    for (const r of await ctx.db
      .query('circleRequests')
      .withIndex('by_from_status', (q) => q.eq('fromUserId', me).eq('status', 'pending'))
      .collect()) {
      outgoing.push({ id: r._id, since: r.createdAt, ...(await personCard(ctx, r.toUserId)) });
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
