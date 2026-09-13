import { pushAlias } from './pushIdentity';
/** OneSignal REST helpers — used only from actions. Needs ONESIGNAL_APP_ID
 * and ONESIGNAL_REST_API_KEY set on the deployment (npx convex env set). */

declare const process: { env: Record<string, string | undefined> };

export function oneSignalConfig() {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) return null;
  // New dashboard keys (os_v2_…) use the Key scheme; legacy keys use Basic.
  const auth = apiKey.startsWith('os_v2_') ? `Key ${apiKey}` : `Basic ${apiKey}`;
  return { appId, auth };
}

/** Resolve Clerk IDs to secret recipient aliases before contacting OneSignal.
 *
 * `badge`: the receiver's unseen inbox count. A positive count sets the
 * icon's attention indicator to 1, just like a release announcement. Only
 * the device clears it, after checking all sources including app updates.
 * Travel pushes leave it alone. Android groups let the app dismiss a read
 * inbox source without cancelling live flight notifications. */
export async function sendFollowerPush(
  externalIds: string[],
  heading: string,
  body: string,
  url: string,
  badge?: number,
): Promise<void> {
  const cfg = oneSignalConfig();
  if (!cfg || externalIds.length === 0) return;
  const aliases = await Promise.all(externalIds.map(pushAlias));
  if (aliases.some(alias => !alias)) return;
  const res = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: { authorization: cfg.auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      app_id: cfg.appId,
      target_channel: 'push',
      include_aliases: { external_id: aliases },
      headings: { en: heading },
      contents: { en: body },
      data: { url },
      ...inboxPushOptions(url, badge),
    }),
  });
  const text = (await res.text()).slice(0, 300);
  // OneSignal answers 200 with an empty id when no alias is subscribed
  // (e.g. every target is a simulator) — surface that too.
  if (!res.ok || !/"id":"[^"]+"/.test(text)) {
    console.warn('[onesignal] push not delivered', res.status, text);
  }
}

export function inboxPushOptions(url: string, badge?: number) {
  if (badge == null) return {};
  const source = url === 'https://getflyright.com/people' ? 'people' : 'support';
  return {
    android_group: `flyright-attention-${source}`,
    ...(badge > 0 ? { ios_badgeType: 'SetTo', ios_badgeCount: 1 } : {}),
  };
}

/** Push-to-start a Live Activity on the traveler's phone (iOS 17.2+, the
 * device registered its push-to-start token via setupDefault). The widget is
 * OneSignal's DefaultLiveActivityAttributes, so both halves nest under
 * "data". Resolves false on an upstream error so the caller can drop the
 * id it minted. */
export async function startLiveActivity(
  externalId: string,
  activityId: string,
  attributes: Record<string, unknown>,
  contentState: Record<string, unknown>,
  heading: string,
  body: string,
): Promise<boolean> {
  const cfg = oneSignalConfig();
  if (!cfg) return false;
  const alias = await pushAlias(externalId);
  if (!alias) return false;
  const res = await fetch(
    `https://api.onesignal.com/apps/${cfg.appId}/activities/activity/DefaultLiveActivityAttributes`,
    {
      method: 'POST',
      headers: { authorization: cfg.auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        event: 'start',
        activity_id: activityId,
        name: 'travel-day start',
        event_attributes: { data: attributes },
        event_updates: { data: contentState },
        headings: { en: heading },
        contents: { en: body },
        target_channel: 'push',
        include_aliases: { external_id: [alias] },
      }),
    },
  );
  const text = (await res.text()).slice(0, 300);
  // 201 {"notification_id": …} — also for a user with no push-to-start
  // token (probed 2026-09-10 with a made-up external_id), so "accepted" is
  // all this can promise. An Android traveler's session therefore keeps a
  // minted id and gets one no-op update push per poll; the device side
  // never sees it. Only upstream errors clear the id.
  const started = res.ok;
  if (!started) console.warn('[onesignal] LA start failed', res.status, text);
  return started;
}

/** Update or end the traveler's lock-screen Live Activity. */
export async function pushLiveActivity(
  activityId: string,
  event: 'update' | 'end',
  contentState: Record<string, unknown>,
): Promise<void> {
  const cfg = oneSignalConfig();
  if (!cfg) return;
  const res = await fetch(
    `https://api.onesignal.com/apps/${cfg.appId}/live_activities/${encodeURIComponent(activityId)}/notifications`,
    {
      method: 'POST',
      headers: { authorization: cfg.auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        event,
        // DefaultLiveActivityAttributes reads context.state.data[...] — the
        // update payload must nest under "data" or decoding fails and iOS
        // dims the widget behind a stuck spinner.
        event_updates: { data: contentState },
        ...(event === 'end' ? { dismissal_date: Math.floor(Date.now() / 1000) + 15 * 60 } : {}),
        name: `travel-day ${event}`,
      }),
    },
  );
  if (!res.ok) console.warn('[onesignal] LA failed', res.status, (await res.text()).slice(0, 200));
}
