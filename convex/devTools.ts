import { v } from 'convex/values';

import { internalMutation } from './_generated/server';

/**
 * Dev-only knobs, callable from the CLI alone (internal functions never
 * reach a client): `npx convex run devTools:patchLiveSession '{...}'`.
 *
 * Puts a live session into an arbitrary state — mid-air with a delay, back
 * to "not yet departed" — so follower surfaces can be screenshotted and
 * reviewed without waiting for a real flight to reach that moment. The
 * poller only ever moves a session forward (applyFlightFacts never nulls a
 * fact or regresses a stage), which is right for production and useless for
 * putting a landed demo flight back in the sky.
 */
export const patchLiveSession = internalMutation({
  args: {
    sessionId: v.id('liveSessions'),
    patch: v.record(v.string(), v.any()),
  },
  handler: async (ctx, { sessionId, patch }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error('No such session');
    await ctx.db.patch(sessionId, { ...patch, updatedAt: new Date().toISOString() });
    return await ctx.db.get(sessionId);
  },
});
