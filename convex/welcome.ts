import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { subscribeEmail as subscribeOneSignalEmail } from './onesignal';

/** Welcome email plumbing. The Clerk webhook (http.ts) schedules this the
 * first time a verified address reaches a profile; OneSignal's welcome
 * Journey ("email subscription added") does the sending, so the copy lives
 * in the dashboard and never needs a deploy. Apple private-relay addresses
 * only deliver because the sending domain is registered under Sign in with
 * Apple's email relay. Manual run (dev has no webhook):
 *   npx convex run welcome:subscribeEmail '{"userId":"user_x","email":"x@y.z"}' */
export const subscribeEmail = internalAction({
  args: { userId: v.string(), email: v.string() },
  handler: async (_ctx, { userId, email }) => {
    const ok = await subscribeOneSignalEmail(userId, email);
    console.log(`[welcome] email subscription for ${userId}: ${ok ? 'ok' : 'failed'}`);
    return ok;
  },
});
