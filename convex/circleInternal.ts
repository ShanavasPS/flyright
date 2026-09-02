import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import {
  activeSessionForKey,
  armHeadsUp,
  circleMembers,
  createSession,
  materializeCircleFollows,
} from './liveHelpers';

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
