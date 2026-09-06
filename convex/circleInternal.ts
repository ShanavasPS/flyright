import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import {
  activeSessionForKey,
  armHeadsUp,
  circleMembers,
  createSession,
  materializeCircleFollows,
  profileFor,
} from './liveHelpers';
import { sendFollowerPush } from './onesignal';

/** The scheduled T−24h heads-up: opens the trip's live session (so the
 * circle can already see it in their People tab) and pushes "Sam flies to
 * FRA tomorrow". Re-validates everything — the journey may have moved,
 * been deleted, or lost its audience since it was armed. */
export const headsUp = internalMutation({
  args: { journeyId: v.id('journeys') },
  handler: async (ctx, { journeyId }) => {
    const journey = await ctx.db.get(journeyId);
    if (!journey) return;
    await ctx.db.patch(journeyId, { headsUpScheduledId: null });
    if (journey.deletedAt || journey.headsUpSentAt) return;

    const now = Date.now();
    const dep = Date.parse(journey.scheduledDeparture);
    if (Number.isNaN(dep) || dep < now) return;
    // Departure pushed later since arming (a stale schedule) → re-arm.
    if (dep - now > 24 * 3_600_000 + 5 * 60_000) {
      await armHeadsUp(ctx, { ...journey, headsUpScheduledId: null });
      return;
    }
    if (!(await circleMembers(ctx, journey.userId)).length) return;

    let session = await activeSessionForKey(ctx, journey.userId, journey.naturalKey);
    if (session) await materializeCircleFollows(ctx, session);
    else session = await createSession(ctx, journey, { stage: null, stamps: {}, activityId: null });

    await ctx.db.patch(journeyId, { headsUpSentAt: new Date(now).toISOString() });
    await ctx.scheduler.runAfter(0, internal.liveInternal.notifyFollowers, {
      sessionId: session._id,
      kind: 'headsUp',
    });
  },
});

/** Who to tell about an in-app invitation, and what to call the two people
 * involved. Null once the row is gone (withdrawn between insert and send). */
export const requestPush = internalQuery({
  args: { requestId: v.id('circleRequests') },
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request) return null;
    const from = await profileFor(ctx, request.fromUserId);
    const to = await profileFor(ctx, request.toUserId);
    return {
      fromUserId: request.fromUserId,
      toUserId: request.toUserId,
      fromName: from?.name ?? 'A traveller',
      toName: to?.name ?? 'A traveller',
    };
  },
});

/** The two pushes an in-app invitation makes: one to the invitee when it is
 * sent, one back to the sender when it is accepted. Both open the People
 * tab, which is where the invitation lives either way. */
export const notifyRequest = internalAction({
  args: { requestId: v.id('circleRequests'), kind: v.union(v.literal('invited'), v.literal('accepted')) },
  handler: async (ctx, { requestId, kind }) => {
    const r = await ctx.runQuery(internal.circleInternal.requestPush, { requestId });
    if (!r) return;
    const invited = kind === 'invited';
    await sendFollowerPush(
      [invited ? r.toUserId : r.fromUserId],
      invited ? `${r.fromName} invited you` : `${r.toName} is following you`,
      invited
        ? `Follow ${r.fromName}'s trips for a heads-up the day before each flight and updates on travel day.`
        : `${r.toName} accepted your invitation and will get updates on your travel days.`,
      'https://getflyright.com/people',
    );
  },
});

/** Whether a trip push may name the screen it is actually about.
 *
 * The person page and the follower trip screen under it arrived in 1.0.23,
 * while this server is deployed the moment it is written — so for a while a
 * push carrying those paths would have landed older installations on a route
 * they did not have, which for a notification is the whole of its purpose
 * missing. It opened the People tab instead.
 *
 * True since 1.0.23 shipped. The app is weeks old and its circles are two
 * people; the cost of an older build meeting one of these is now one tap on
 * app/+not-found, which says what happened and offers the update. Set this
 * back to false if a future push ever names a screen before its build is
 * out — that is the whole reason it is a constant and not a deleted line. */
const TRIP_DEEP_LINKS_LANDED = true;

/** Who hears that a trip was added, and what it says. Mute is honoured the
 * same way a travel-day push honours it (liveInternal.getNotifyTargets):
 * the member keeps seeing the trip in their People tab, they just aren't
 * told. Null when the circle is empty or every trip has since gone. */
export const tripsAddedPush = internalQuery({
  args: { ownerId: v.string(), journeyIds: v.array(v.id('journeys')) },
  handler: async (ctx, { ownerId, journeyIds }) => {
    const circle = await circleMembers(ctx, ownerId);
    const externalIds = circle.filter((c) => !c.muted).map((c) => c.memberId);
    if (!externalIds.length) return null;

    const now = Date.now();
    const trips = [];
    for (const id of journeyIds) {
      const j = await ctx.db.get(id);
      // Re-validated: a trip added and deleted again before this action ran
      // is not news, and neither is one whose departure has since passed.
      if (!j || j.userId !== ownerId || j.deletedAt) continue;
      const dep = Date.parse(j.scheduledDeparture);
      if (Number.isNaN(dep) || dep < now) continue;
      trips.push({
        journeyId: j._id,
        number: j.number,
        carrier: j.carrier,
        fromCode: j.fromCode,
        toCode: j.toCode,
        scheduledDeparture: j.scheduledDeparture,
      });
    }
    if (!trips.length) return null;
    const profile = await profileFor(ctx, ownerId);
    return { externalIds, ownerName: profile?.name ?? 'Your traveller', trips };
  },
});

/** "Shanavas added a trip." The first thing a follower hears about a flight —
 * until now the circle heard nothing between accepting an invitation and the
 * T−24h heads-up, which for a trip booked months out is a season of silence
 * while the trip sat visible in their People tab, unannounced.
 *
 * One push per sync, not per trip: signing in on a new phone replays the
 * whole journal as inserts, and a circle should not get forty notifications
 * because somebody changed devices. */
export const notifyTripsAdded = internalAction({
  args: { ownerId: v.string(), journeyIds: v.array(v.id('journeys')) },
  handler: async (ctx, { ownerId, journeyIds }) => {
    const p = await ctx.runQuery(internal.circleInternal.tripsAddedPush, { ownerId, journeyIds });
    if (!p) return;
    const [first] = p.trips;
    const many = p.trips.length > 1;
    const when = new Date(first.scheduledDeparture).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    await sendFollowerPush(
      p.externalIds,
      many
        ? `${p.ownerName} added ${p.trips.length} trips`
        : `${first.number || first.carrier} · ${first.fromCode} → ${first.toCode}`,
      many
        ? `Their next one leaves ${when}. You'll get a heads-up the day before each.`
        : `${p.ownerName} is flying to ${first.toCode} on ${when}. You'll get a heads-up the day before.`,
      // One trip opens on that trip; several open on the person, which is
      // where all of them are — but only once a build that HAS those screens
      // is the one in people's hands. See TRIP_DEEP_LINKS_LANDED.
      TRIP_DEEP_LINKS_LANDED
        ? many
          ? `https://getflyright.com/person/${ownerId}`
          : `https://getflyright.com/person/${ownerId}/trip/${first.journeyId}`
        : 'https://getflyright.com/people',
    );
  },
});
