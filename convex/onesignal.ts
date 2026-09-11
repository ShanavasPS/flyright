/** OneSignal REST helpers — used only from actions. Needs ONESIGNAL_APP_ID
 * and ONESIGNAL_REST_API_KEY set on the deployment (npx convex env set). */

declare const process: { env: Record<string, string | undefined> };

function config() {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) return null;
  // New dashboard keys (os_v2_…) use the Key scheme; legacy keys use Basic.
  const auth = apiKey.startsWith('os_v2_') ? `Key ${apiKey}` : `Basic ${apiKey}`;
  return { appId, auth };
}

/** Push to specific users by Clerk id (IdentitySync sets external_id).
 *
 * `badge`: the count to leave on the iOS app icon — the receiver's whole
 * unseen inbox (attention.badgeFor), so it lands even while the app is
 * closed, the way a mail app's does. Set, not incremented: the client owns
 * the same number and rewrites it on every foreground, so the two never
 * drift apart. Omitted for pushes that aren't about an inbox item, which
 * leaves whatever count is showing alone. Android launchers badge from the
 * notification itself, so nothing to send there. */
export async function sendFollowerPush(
  externalIds: string[],
  heading: string,
  body: string,
  url: string,
  badge?: number,
): Promise<void> {
  const cfg = config();
  if (!cfg || externalIds.length === 0) return;
  const res = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: { authorization: cfg.auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      app_id: cfg.appId,
      target_channel: 'push',
      include_aliases: { external_id: externalIds },
      headings: { en: heading },
      contents: { en: body },
      data: { url },
      ...(badge == null ? {} : { ios_badgeType: 'SetTo', ios_badgeCount: badge }),
    }),
  });
  const text = (await res.text()).slice(0, 300);
  // OneSignal answers 200 with an empty id when no alias is subscribed
  // (e.g. every target is a simulator) — surface that too.
  if (!res.ok || !/"id":"[^"]+"/.test(text)) {
    console.warn('[onesignal] push not delivered', res.status, text);
  }
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
  const cfg = config();
  if (!cfg) return false;
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
        include_aliases: { external_id: [externalId] },
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
  const cfg = config();
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
