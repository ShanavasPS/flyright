import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { storeVersion, updatePushPayload } from './appUpdateShared';
import { oneSignalConfig } from './onesignal';

declare const process: { env: Record<string, string | undefined> };
const platform = v.union(v.literal('ios'), v.literal('android'));

/** Persist the key BEFORE contacting OneSignal. Overlapping cron runs and
 * a crash after sending must reuse the same request, never send twice. */
export const prepare = internalMutation({
  args: { platform, version: v.string(), idempotencyKey: v.string() },
  handler: async (ctx, args): Promise<Doc<'appUpdateAnnouncements'> | null> => {
    const row = await ctx.db.query('appUpdateAnnouncements')
      .withIndex('by_release', (q) => q.eq('platform', args.platform).eq('version', args.version))
      .unique();
    const now = Date.now();
    if (row) {
      if (row.sentAt !== null || now - row.lastAttemptAt < 5 * 60_000) return null;
      // OneSignal deduplicates for 30 days. Don't reuse an expired key.
      if (now - row._creationTime >= 29 * 86400_000) return null;
      await ctx.db.patch(row._id, { lastAttemptAt: now });
      return { ...row, lastAttemptAt: now };
    }
    const id = await ctx.db.insert('appUpdateAnnouncements', {
      ...args, lastAttemptAt: now, sentAt: null, notificationId: null,
    });
    return ctx.db.get(id);
  },
});

export const markSent = internalMutation({
  args: { id: v.id('appUpdateAnnouncements'), notificationId: v.string() },
  handler: async (ctx, { id, notificationId }) => {
    await ctx.db.patch(id, { sentAt: Date.now(), notificationId });
  },
});

/** Runs independently of open apps. The existing public store lookup is
 * the authority; a submitted version or release-notes entry cannot trigger
 * a notification. Explicit enablement keeps development deployments quiet. */
export const check = internalAction({
  args: {},
  handler: async (ctx) => {
    if (process.env.APP_UPDATE_PUSH_ENABLED !== 'true') return;
    const config = oneSignalConfig();
    if (!config) throw new Error('App update pushes require OneSignal configuration');

    for (const platform of ['ios', 'android'] as const) {
      try {
        const response = await fetch(`https://getflyright.com/api/app-version?platform=${platform}&version=0`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`Store lookup returned ${response.status}`);
        const version = storeVersion(await response.json());
        if (!version) continue;
        const announcement = await ctx.runMutation(internal.appUpdates.prepare, {
          platform, version, idempotencyKey: crypto.randomUUID(),
        });
        if (!announcement) continue;
        const sent = await fetch('https://api.onesignal.com/notifications', {
          method: 'POST',
          headers: { authorization: config.auth, 'content-type': 'application/json' },
          body: JSON.stringify({
            app_id: config.appId,
            ...updatePushPayload(platform, version, announcement.idempotencyKey),
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!sent.ok) throw new Error(`OneSignal returned ${sent.status}`);
        const result = await sent.json();
        if (typeof result.id !== 'string') throw new Error('Invalid OneSignal notification response');
        // Empty id means a valid request with no matching subscribers.
        // That's complete too; later app launches discover the update.
        await ctx.runMutation(internal.appUpdates.markSent, { id: announcement._id, notificationId: result.id });
      } catch (error) {
        console.warn(`[app-updates] ${platform} announcement failed; next check will retry`, error);
      }
    }
  },
});
