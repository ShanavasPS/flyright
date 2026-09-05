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
