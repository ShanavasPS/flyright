import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { after, allowedAt, peopleSeenFor, unseenPeople } from './attentionHelpers';
import { maySee } from './audience';
import { CIRCLE_FULL, MAX_PENDING_REQUESTS, searchKey } from './circleShared';
import { isPro } from './entitlements';
import { onwardLegs } from './itinerary';
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
import { preferredSession, stillLive, toPublicSession } from './liveShared';
import { latestUpdate, updatesFor } from './updates';
import { updateWindowOpen } from './updatesShared';

/** Find My-style circles: who follows my trips, whose trips I follow.
 * Invites are personal links (getflyright.com/i/<token>); accepting one adds
 * the acceptor to the owner's circle, which then rides along on every live
 * session through liveHelpers.materializeCircleFollows. */

async function requireIdentity(ctx: MutationCtx | QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Not authenticated');
  return identity;
}

/** The public face of a person: name, photo, and whether they hold Pro —
 * the one fact about a member the badge on their avatar shows. The server
 * decides Pro from the RevenueCat webhook's entitlement row, never the
 * client, so a badge can't be minted by editing a profile. */
export async function personCard(ctx: QueryCtx | MutationCtx, userId: string) {
  const profile = await profileFor(ctx, userId);
  return {
    userId,
    name: profile?.name ?? 'A traveler',
    imageUrl: profile?.imageUrl ?? null,
    pro: await isPro(ctx, userId),
  };
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
    return { ownerName: owner.name, ownerImageUrl: owner.imageUrl, ownerPro: owner.pro, relation, full };
  },
});

type RequestKind = NonNullable<Doc<'circleRequests'>['kind']>;

/** Rows minted before the field existed are invitations. */
function kindOf(r: Doc<'circleRequests'>): RequestKind {
  return r.kind ?? 'invite';
}

/** The pending in-app request between two people, in one direction and of
 * one kind: an 'invite' (from offers their trips) or a 'follow' (from asks
 * to see to's trips). */
async function pendingRequest(
  ctx: QueryCtx | MutationCtx,
  fromUserId: string,
  toUserId: string,
  kind: RequestKind = 'invite',
) {
  const rows = await ctx.db
    .query('circleRequests')
    .withIndex('by_pair', (q) => q.eq('fromUserId', fromUserId).eq('toUserId', toUserId))
    .filter((q) => q.eq(q.field('status'), 'pending'))
    .collect();
  return rows.find((r) => kindOf(r) === kind) ?? null;
}

async function pendingOutstanding(ctx: QueryCtx | MutationCtx, me: string) {
  const outstanding = await ctx.db
    .query('circleRequests')
    .withIndex('by_from_status', (q) => q.eq('fromUserId', me).eq('status', 'pending'))
    .collect();
  return outstanding.length;
}

async function areSharing(ctx: QueryCtx | MutationCtx, ownerId: string, memberId: string) {
  return await ctx.db
    .query('circle')
    .withIndex('by_owner_member', (q) => q.eq('ownerId', ownerId).eq('memberId', memberId))
    .unique();
}

/** PUBLIC (signed in) — "add someone" search. Matches a WHOLE address, a
 * WHOLE name, or a WHOLE first name, all lowercased (circleShared.searchKey /
 * firstNameKey): a prefix search would hand anyone a directory of everyone
 * using the app. The first-name match is what makes "tamanna" find a
 * profile whose sign-in provider filed "Tamanna Irshad" as the first name.
 * Answers with a name and a photo only — never an address, not even the one
 * that was typed, and never a hint that some other query would have matched. */
export const findPeople = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const key = searchKey(q);
    if (!key) return [];
    const me = identity.subject;

    let hits: Doc<'profiles'>[];
    if (key.includes('@')) {
      hits = await ctx.db
        .query('profiles')
        .withIndex('by_email', (p) => p.eq('email', key))
        .take(10);
    } else {
      const whole = await ctx.db
        .query('profiles')
        .withIndex('by_search_name', (p) => p.eq('searchName', key))
        .take(10);
      const first = key.includes(' ')
        ? []
        : await ctx.db
            .query('profiles')
            .withIndex('by_search_first', (p) => p.eq('searchFirst', key))
            .take(10);
      const seen = new Set<string>();
      hits = [...whole, ...first].filter((p) => !seen.has(p.userId) && seen.add(p.userId));
    }

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
        pro: await isPro(ctx, hit.userId),
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
    // They already asked to follow me: inviting them is the yes.
    const ask = await pendingRequest(ctx, userId, me, 'follow');
    if (ask) {
      await join(ctx, me, userId);
      await ctx.scheduler.runAfter(0, internal.circleInternal.notifyRequest, {
        requestId: ask._id,
        kind: 'allowed',
      });
      return { status: 'sharing' as const };
    }
    if ((await pendingOutstanding(ctx, me)) >= MAX_PENDING_REQUESTS) {
      throw new Error('Too many pending invites');
    }

    const requestId = await ctx.db.insert('circleRequests', {
      fromUserId: me,
      toUserId: userId,
      kind: 'invite',
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

/** "Follow back": ask to see someone's trips. The mirror of requestFollow —
 * there the sender offers their trips, here they ask for the other's — so
 * it is the other person who says yes, and their circle that gains a
 * member. Until now a follower could only ever be followed back if THEY
 * thought to invite; this puts the ask on the follower's own row.
 *
 * If they have already invited me, that invitation is the answer: it is
 * accepted on the spot rather than left pending next to a request that
 * asks for the same thing. Idempotent per pair. */
export const askToFollow = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const identity = await requireIdentity(ctx);
    const me = identity.subject;
    if (userId === me) throw new Error('Own request');
    const profile = await profileFor(ctx, userId);
    if (!profile) throw new Error('No such person');
    if (await areSharing(ctx, userId, me)) return { status: 'following' as const };

    const invitation = await pendingRequest(ctx, userId, me, 'invite');
    if (invitation) {
      // Throws CIRCLE_FULL if their circle filled up since they invited me.
      await join(ctx, userId, me);
      await ctx.scheduler.runAfter(0, internal.circleInternal.notifyRequest, {
        requestId: invitation._id,
        kind: 'accepted',
      });
      return { status: 'following' as const };
    }

    if (await pendingRequest(ctx, me, userId, 'follow')) return { status: 'pending' as const };
    if ((await pendingOutstanding(ctx, me)) >= MAX_PENDING_REQUESTS) {
      throw new Error('Too many pending requests');
    }
    const requestId = await ctx.db.insert('circleRequests', {
      fromUserId: me,
      toUserId: userId,
      kind: 'follow',
      status: 'pending',
      createdAt: new Date().toISOString(),
      respondedAt: null,
    });
    await ctx.scheduler.runAfter(0, internal.circleInternal.notifyRequest, {
      requestId,
      kind: 'asked',
    });
    return { status: 'pending' as const };
  },
});

/** The person asked answers. Accepting an invitation runs the same join as
 * a redeemed link, so both doors open on the same room; accepting a follow
 * request is the same join the other way round — the asker joins MY circle. */
export const respondToRequest = mutation({
  args: { requestId: v.id('circleRequests'), accept: v.boolean() },
  handler: async (ctx, { requestId, accept }) => {
    const identity = await requireIdentity(ctx);
    const request = await ctx.db.get(requestId);
    if (!request || request.toUserId !== identity.subject) throw new Error('Not your invite');
    if (request.status !== 'pending') return { status: request.status };

    if (accept) {
      const follow = kindOf(request) === 'follow';
      // An invitation whose sender's circle filled up meanwhile (they invited
      // several people; someone else said yes first) can't be accepted. It
      // stays pending so it can be answered once there's room — and the
      // sender is told, once, that this person tried. Returned rather than
      // thrown: a throw would roll the note back with everything else.
      if (!follow && (await circleFull(ctx, request.fromUserId))) {
        await noteBlockedAttempt(ctx, request);
        return { status: 'full' as const };
      }
      // Throws CIRCLE_FULL if my own circle is full for a follow request —
      // I'm the one tapping, so I see it directly.
      if (follow) await join(ctx, identity.subject, request.fromUserId);
      else await join(ctx, request.fromUserId, identity.subject);
      await ctx.scheduler.runAfter(0, internal.circleInternal.notifyRequest, {
        requestId,
        kind: follow ? 'allowed' : 'accepted',
      });
    }
    await ctx.db.patch(requestId, {
      status: accept ? 'accepted' : 'declined',
      respondedAt: new Date().toISOString(),
    });
    return { status: accept ? ('accepted' as const) : ('declined' as const) };
  },
});

/** "<name> tried to follow you, but your circle is full": the one push an
 * inviter gets about a seat they promised and can't give. Once per row —
 * `blockedAt` remembers it, so a second, third, tenth tap on the same
 * invitation says nothing more. */
async function noteBlockedAttempt(ctx: MutationCtx, request: Doc<'circleRequests'>) {
  if (request.blockedAt) return;
  await ctx.db.patch(request._id, { blockedAt: new Date().toISOString() });
  await ctx.scheduler.runAfter(0, internal.circleInternal.notifyRequest, {
    requestId: request._id,
    kind: 'blocked',
  });
}

/** The invite-link twin of the blocked accept above. A link has no request
 * row, so the attempt is written as one: a pending invitation from the
 * owner to the caller, already marked blocked. That gives the owner the row
 * ("tried to join — your circle is full") and the one push, and keeps the
 * caller's intent — the invitation waits in their People tab and can be
 * accepted the moment the owner makes room. No 'invited' push is sent for
 * it: the owner already reached out, the link was the invitation.
 *
 * The join-circle screen calls this when it shows the "circle is full"
 * state to a signed-in traveller; a link opened anonymously names nobody
 * and notes nothing. Idempotent per owner+caller. */
export const noteFullInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const identity = await requireIdentity(ctx);
    const me = identity.subject;
    const invite = await ctx.db
      .query('circleInvites')
      .withIndex('by_token', (q) => q.eq('token', token))
      .unique();
    if (!inviteUsable(invite)) return;
    const ownerId = invite!.ownerId;
    if (ownerId === me) return;
    if (await areSharing(ctx, ownerId, me)) return;
    if (!(await circleFull(ctx, ownerId))) return;

    let request = await pendingRequest(ctx, ownerId, me, 'invite');
    if (!request) {
      if ((await pendingOutstanding(ctx, ownerId)) >= MAX_PENDING_REQUESTS) return;
      const requestId = await ctx.db.insert('circleRequests', {
        fromUserId: ownerId,
        toUserId: me,
        kind: 'invite',
        status: 'pending',
        createdAt: new Date().toISOString(),
        respondedAt: null,
      });
      request = (await ctx.db.get(requestId))!;
    }
    await noteBlockedAttempt(ctx, request);
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
  // Mid-connection the owner has two active sessions; the page leads with
  // the one still travelling and lists the landed leg above it.
  const active: Doc<'liveSessions'>[] = [];
  for (const f of follows) {
    if (f.ownerId !== ownerId) continue;
    const session = await ctx.db.get(f.sessionId);
    if (session && session.status === 'active') active.push(session);
  }
  return preferredSession(active);
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
  /** Who is reading — their own heart on an update is theirs to see. */
  viewerId: string | null,
) {
  const now = Date.now();
  const upcoming: Doc<'journeys'>[] = [];
  const past: Doc<'journeys'>[] = [];
  let hiddenAhead = 0;
  let hiddenFlown = 0;
  let privateCount = 0;
  let liveJourneyId: Id<'journeys'> | null = null;
  const journeys = await ctx.db
    .query('journeys')
    .withIndex('by_user', (q) => q.eq('userId', ownerId))
    .collect();
  for (const j of journeys) {
    if (j.deletedAt) continue;
    const dep = Date.parse(j.scheduledDeparture);
    if (Number.isNaN(dep)) continue;
    if (j.privateTrip) {
      // A private trip is nobody's business — not even as a count.
      privateCount++;
      continue;
    }
    if (!maySee(j, seesHidden)) {
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
  // What the traveller has shared from the trip they are on: the live leg,
  // or — the morning after landing, when the pass has already let the trip
  // go — the most recent leg still inside its update window. Every update
  // on a trip stays on that trip's own page; this is the one block the
  // person page leads with.
  const current =
    (session && [...upcoming, ...past].find((j) => j.naturalKey === session.naturalKey)) ??
    [...past, ...upcoming].find((j) => updateWindowOpen(j, now));
  const updates = current ? await updatesFor(ctx, ownerId, current.naturalKey, viewerId) : [];
  return {
    liveJourneyId,
    upcoming: upcoming.map(publicTrip),
    past: shownPast.map(publicTrip),
    /** The trip the updates below belong to (listed above, or the live one). */
    updatesJourneyId: current && updates.length ? current._id : null,
    updates,
    // Totals count every trip; the lists above hold what I may open.
    ahead: upcoming.length + hiddenAhead,
    flown: past.length + hiddenFlown,
    hiddenAhead,
    hiddenFlown,
    /** Trips only the owner sees, listed nowhere — for the owner's preview. */
    privateCount,
    /** Listed trips that are close-circle only — for the owner's preview. */
    hiddenIds: [...upcoming, ...shownPast].filter((j) => j.hiddenFromCircle).map((j) => j._id),
    /** journeyId → the owner's local row id, so the owner's preview can edit
     * a trip from the row. Stripped before a member sees anything. */
    keys: Object.fromEntries([...upcoming, ...shownPast].map((j) => [j._id, j.naturalKey])),
  };
}

/** The live leg as a follower sees it, plus `onward`: the connecting legs
 * that follow it in the owner's journal, so the follower knows the trip
 * doesn't end where this flight lands. */
async function liveCard(
  ctx: QueryCtx,
  session: Doc<'liveSessions'> | null,
  name: string | null,
  seesHidden: boolean,
  viewerId: string | null,
) {
  if (!session) return null;
  const onward = await onwardLegs(ctx, session.userId, session, seesHidden);
  // Two hours after it lands — recorded or by the timetable — the trip is
  // history: no card, and the leg files under Flown like any other.
  if (!stillLive(session, Date.now(), onward)) return null;
  const follows = await ctx.db
    .query('follows')
    .withIndex('by_session', (q) => q.eq('sessionId', session._id))
    .collect();
  return {
    token: session.shareToken,
    session: toPublicSession(session, name, follows.length),
    onward,
    /** The traveller's latest word from this leg, for the pass. */
    update: await latestUpdate(ctx, session.userId, session.naturalKey, viewerId),
  };
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
    // My standing ask to see their trips, if any — the page shows it as
    // "asked, waiting" instead of offering to ask again.
    const asked = theirs ? null : (await pendingRequest(ctx, me, userId, 'follow'))?._id ?? null;

    if (theirs) {
      const session = await liveFor(ctx, me, userId);
      const live = await liveCard(ctx, session, who.name, !!theirs.close, me);
      const { hiddenAhead: _a, hiddenFlown: _f, hiddenIds: _h, keys: _k, ...travel } = await travelOf(
        ctx,
        userId,
        !!theirs.close,
        live ? session : null,
        me,
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
        asked,
        live,
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
      asked,
      live: null,
      liveJourneyId: null,
      upcoming: [],
      past: [],
      updatesJourneyId: null,
      updates: [],
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
      if (!journey || !maySee(journey, seesHidden)) continue;
      session = s;
      break;
    }

    const who = await personCard(ctx, me);
    const live = await liveCard(ctx, session, who.name, seesHidden, me);
    return {
      ...who,
      member,
      close: seesHidden,
      followers,
      live,
      ...(await travelOf(ctx, me, seesHidden, live ? session : null, me)),
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
      !maySee(journey, !!membership.close)
    ) {
      return { gone: true as const };
    }

    const who = await personCard(ctx, ownerId);
    const session = await liveFor(ctx, me, ownerId);
    const liveHere = session && session.naturalKey === journey.naturalKey ? session : null;
    return {
      owner: who,
      trip: publicTrip(journey),
      updates: await updatesFor(ctx, ownerId, journey.naturalKey, me),
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
  // However they got here — a link, an invitation or a follow request — any
  // pending request for exactly this (the owner's invitation to the member,
  // or the member's ask to follow the owner) is answered now, so the People
  // tab doesn't keep offering something that already happened.
  for (const request of [
    await pendingRequest(ctx, ownerId, memberId, 'invite'),
    await pendingRequest(ctx, memberId, ownerId, 'follow'),
  ]) {
    if (request) {
      await ctx.db.patch(request._id, {
        status: 'accepted',
        respondedAt: new Date().toISOString(),
      });
    }
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
/** Someone's next upcoming trip as seen from a seat in their circle — only
 * the public-safe flight snapshot, the same fields a live session exposes.
 * Never naturalKey or prices. `close` is the seat's close-circle flag: trips
 * marked "Only my close circle" stay invisible to everyone else. */
async function nextTrip(ctx: QueryCtx, ownerId: string, close: boolean, now: number) {
  const journeys = await ctx.db
    .query('journeys')
    .withIndex('by_user', (q) => q.eq('userId', ownerId))
    .collect();
  let next: {
    carrier: string;
    number: string;
    fromCode: string;
    toCode: string;
    scheduledDeparture: string;
    scheduledArrival: string;
  } | null = null;
  for (const j of journeys) {
    if (j.deletedAt || !maySee(j, close)) continue;
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
  if (!next) return null;
  // The legs that connect off it: the row can then say "COK → DOH → HEL,
  // 2h 55m in Doha" instead of a first leg that stops short of the trip.
  return { ...next, onward: await onwardLegs(ctx, ownerId, next, close) };
}

/** List order for a people tab: soonest upcoming departure first, then
 * those with nothing booked by the newest connection, names as a tiebreak. */
function byNextTripThenNewest(
  a: { name: string; since: string; next: { scheduledDeparture: string } | null },
  b: { name: string; since: string; next: { scheduledDeparture: string } | null },
) {
  if (a.next && b.next) {
    return (
      Date.parse(a.next.scheduledDeparture) - Date.parse(b.next.scheduledDeparture) ||
      a.name.localeCompare(b.name)
    );
  }
  if (a.next !== b.next) return a.next ? -1 : 1;
  return b.since.localeCompare(a.since) || a.name.localeCompare(b.name);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const me = identity.subject;
    const now = Date.now();

    // When each side was last looked at. A row newer than its side's stamp
    // is `fresh` — "New" on the page, and counted in `unseen` for the
    // badges (attentionHelpers.unseenPeople, the same rule). Null: never
    // looked, so everything is new.
    const seen = await peopleSeenFor(ctx, me);
    const followersSeenAt = seen?.followersSeenAt ?? null;
    const followingSeenAt = seen?.followingSeenAt ?? null;

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

      // A traveller mid-connection has two active sessions: the leg that
      // landed and the one about to leave. The row shows the one that
      // still has travelling in it.
      const active: Doc<'liveSessions'>[] = [];
      for (const f of myFollows) {
        if (f.ownerId !== row.ownerId) continue;
        const session = await ctx.db.get(f.sessionId);
        if (session && session.status === 'active') active.push(session);
      }
      const live = await liveCard(ctx, preferredSession(active), owner.name, !!row.close, me);

      const next = live ? null : await nextTrip(ctx, row.ownerId, !!row.close, now);
      following.push({
        ...owner,
        muted: row.muted,
        close: !!row.close,
        since: row.createdAt,
        /** They follow me too — otherwise the row offers "Share back". */
        followsMe: !!(await areSharing(ctx, me, row.ownerId)),
        /** They allowed my ask to follow them since I last looked here. */
        fresh: after(await allowedAt(ctx, row.ownerId, me), followingSeenAt),
        live,
        next,
      });
    }

    // In-app requests still waiting, mine and theirs, of both kinds.
    const toMe = await ctx.db
      .query('circleRequests')
      .withIndex('by_to_status', (q) => q.eq('toUserId', me).eq('status', 'pending'))
      .collect();
    const fromMe = await ctx.db
      .query('circleRequests')
      .withIndex('by_from_status', (q) => q.eq('fromUserId', me).eq('status', 'pending'))
      .collect();

    const followers = [];
    for (const row of await circleMembers(ctx, me)) {
      const asked = fromMe.find((r) => kindOf(r) === 'follow' && r.toUserId === row.memberId);
      // My seat in THEIR circle — when I hold one, their next trip is
      // already mine to see (it's on the Following tab), so it can order
      // this list too. Anyone I don't follow sorts by when they arrived.
      const mine = await areSharing(ctx, row.memberId, me);
      followers.push({
        ...(await personCard(ctx, row.memberId)),
        close: !!row.close,
        since: row.createdAt,
        /** Joined since I last looked at Followers. */
        fresh: after(row.createdAt, followersSeenAt),
        /** I follow them too — otherwise the row offers "Follow back"... */
        following: !!mine,
        /** ...or shows the ask already out, with its id to withdraw it. */
        askedId: asked?._id ?? null,
        next: mine ? await nextTrip(ctx, row.memberId, !!mine.close, now) : null,
      });
    }

    // Invitations to follow someone (answer → Following) and asks to follow
    // me (answer → Followers), kept apart because each is answered on the
    // tab it changes. Older clients only know the first list.
    // `blocked`: an invitation someone tried to accept while the inviter's
    // circle was full. On the inviter's row it says who is waiting for a
    // seat; on the invitee's, why "Follow" didn't take.
    type RequestCard = {
      id: Id<'circleRequests'>;
      since: string;
      blocked: boolean;
      fresh: boolean;
    } & Awaited<ReturnType<typeof personCard>>;
    const incoming: RequestCard[] = [];
    const followRequests: RequestCard[] = [];
    for (const r of toMe) {
      const follow = kindOf(r) === 'follow';
      const card = {
        id: r._id,
        since: r.createdAt,
        blocked: !!r.blockedAt,
        // Arrived since I last looked at the side it is answered on.
        fresh: after(r.createdAt, follow ? followersSeenAt : followingSeenAt),
        ...(await personCard(ctx, r.fromUserId)),
      };
      (follow ? followRequests : incoming).push(card);
    }
    // Mine: invitations out (a seat held open in Followers) and asks out to
    // people who don't follow me, so they'd have no row to show it on.
    const outgoing: RequestCard[] = [];
    const asked: RequestCard[] = [];
    for (const r of fromMe) {
      const card = {
        id: r._id,
        since: r.createdAt,
        blocked: !!r.blockedAt,
        // Mine, so never news — except an invitation someone tried to
        // accept while my circle was full, which lands on Followers.
        fresh: after(r.blockedAt, followersSeenAt),
        ...(await personCard(ctx, r.toUserId)),
      };
      if (kindOf(r) === 'invite') outgoing.push(card);
      else if (!followers.some((f) => f.userId === r.toUserId)) asked.push(card);
    }

    // Both tabs: whoever flies soonest on top (someone in the air first),
    // then everyone without a trip, newest connection first.
    following.sort((a, b) => (a.live ? 0 : 1) - (b.live ? 0 : 1) || byNextTripThenNewest(a, b));
    followers.sort(byNextTripThenNewest);
    for (const list of [incoming, followRequests, outgoing, asked]) {
      list.sort((a, b) => b.since.localeCompare(a.since));
    }
    // Server truth for the cap — the client's SDK entitlement can lead it
    // (purchase just made) but never the other way round.
    return {
      following,
      followers,
      incoming,
      followRequests,
      outgoing,
      asked,
      full: await circleFull(ctx, me),
      /** How much of each side is fresh — the same count the People tab's
       * badge shows, so the page marks a side seen exactly when the badge
       * would want it to. */
      unseen: await unseenPeople(ctx, me),
    };
  },
});
