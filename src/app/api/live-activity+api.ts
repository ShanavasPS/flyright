import { boundedBody } from '../../../convex/uploadShared';
/**
 * POST /api/live-activity — proxy for OneSignal's Live Activity REST API,
 * so the REST key stays server-side. Body:
 *   { activityId: string, event: 'update' | 'end', contentState?: object }
 *
 * Deployed with EAS Hosting; set ONESIGNAL_REST_API_KEY (and optionally
 * ONESIGNAL_APP_ID — falls back to the public EXPO_PUBLIC_ONESIGNAL_APP_ID)
 * in the hosting environment.
 *
 * No account stands behind this call — signed-out travelers get a lock
 * screen too — so the activity id is the credential: a 128-bit value minted
 * on-device from the platform CSPRNG (see services/live-activity.ts), never
 * shown anywhere. What the route adds is a refusal to be a free relay for
 * our OneSignal key: every call is metered in Convex per activity (lifetime,
 * count, pacing) and per address per day (convex/liveActivityMeter.ts), and
 * the content is bounded (only the widget's keys, short strings). Metering
 * outages return 503, preventing unmetered calls to the paid provider.
 */

import { api } from '../../../convex/_generated/api';
import { clientAddressHash, convex } from '@/server/lookup-gate';

/** Widget strings are one line each; anything longer is not a flight status. */
const MAX_STRING = 120;
const MAX_ACTIVITY_ID = 96;
const MAX_BODY_BYTES = 4096;

/** Only the keys the widget renders may pass through. */
const STATE_KEYS = [
  'headline',
  'subtitle',
  'progress',
  'stageLabel',
  'compactLabel',
  'departsAt',
  'arrivesAt',
  'countdownEnd',
  'countdownKind',
  'gate',
  'terminal',
  'delayLabel',
  'emphasis',
  'depTime',
  'arrTime',
] as const;

export async function POST(request: Request) {
  const appId = process.env.ONESIGNAL_APP_ID ?? process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) {
    // Names only — helps diagnose env wiring without leaking values.
    const missing = [!appId && 'app id', !apiKey && 'rest key'].filter(Boolean).join(', ');
    return Response.json(
      { error: `live activity updates not configured (missing: ${missing})` },
      { status: 501 },
    );
  }

  let raw: string;
  try { raw = new TextDecoder().decode(await boundedBody(request, MAX_BODY_BYTES)); }
  catch { return Response.json({ error: 'body too large' }, { status: 413 }); }
  let body: { activityId?: unknown; event?: unknown; contentState?: Record<string, unknown> } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const activityId = typeof body?.activityId === 'string' ? body.activityId : '';
  const event = body?.event;
  if (
    !activityId ||
    activityId.length > MAX_ACTIVITY_ID ||
    !/^[A-Za-z0-9~_-]+$/.test(activityId) ||
    (event !== 'update' && event !== 'end')
  ) {
    return Response.json({ error: 'activityId and event (update|end) are required' }, { status: 400 });
  }

  const eventUpdates: Record<string, unknown> = {};
  for (const key of STATE_KEYS) {
    const value = body?.contentState?.[key];
    if (value === undefined) continue;
    if (typeof value === 'string') {
      if (value.length > MAX_STRING) return Response.json({ error: `${key} too long` }, { status: 400 });
      eventUpdates[key] = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      eventUpdates[key] = value;
    } else {
      return Response.json({ error: `${key} must be a string or number` }, { status: 400 });
    }
  }
  if (Object.keys(eventUpdates).length === 0) {
    // Ends need the final state too — empty content is what the widget
    // renders while the activity lingers dimmed after ending.
    return Response.json({ error: 'contentState is required' }, { status: 400 });
  }

  const verdict = await meter(request, activityId, event);
  if (!verdict.allowed) {
    console.warn('[live-activity] refused', verdict.reason);
    return Response.json({ error: verdict.reason === 'unavailable' ? 'metering unavailable' : 'rate limited', reason: verdict.reason }, { status: verdict.reason === 'unavailable' ? 503 : 429 });
  }

  const upstream = await fetch(
    `https://api.onesignal.com/apps/${appId}/live_activities/${encodeURIComponent(activityId)}/notifications`,
    {
      method: 'POST',
      headers: {
        // New dashboard keys (os_v2_…) use the Key scheme; the app's original
        // Legacy API Key authenticates with Basic.
        authorization: apiKey.startsWith('os_v2_') ? `Key ${apiKey}` : `Basic ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        event,
        // DefaultLiveActivityAttributes contract: the widget reads
        // context.state.data[...], so updates MUST nest under "data" — flat
        // keys fail ContentState decoding and iOS dims the activity behind
        // a stuck spinner. Send the final state on 'end' too.
        event_updates: { data: eventUpdates },
        ...(event === 'end'
          ? { dismissal_date: Math.floor(Date.now() / 1000) + 15 * 60 }
          : {}),
        name: `travel-day ${event}`,
      }),
    },
  );

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    console.warn('[live-activity] upstream', upstream.status, detail.slice(0, 200));
    return Response.json({ error: 'upstream error' }, { status: 502 });
  }
  return Response.json({ ok: true });
}

/** Refuse paid work if the activity/address meters cannot authorize it. */
async function meter(
  request: Request,
  activityId: string,
  event: 'update' | 'end',
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const secret = process.env.LOOKUP_QUOTA_SECRET;
  const client = convex();
  if (!secret || !client) {
    if (process.env.NODE_ENV === 'production') console.warn('[live-activity] metering not configured');
    return process.env.NODE_ENV === 'production' ? { allowed: false, reason: 'unavailable' } : { allowed: true };
  }
  try {
    return await client.mutation(api.liveActivityMeter.permit, {
      secret,
      activityId,
      address: await clientAddressHash(request),
      event,
    });
  } catch (error) {
    console.warn('[live-activity] metering unavailable', error);
    return { allowed: false, reason: 'unavailable' };
  }
}
