/**
 * POST /api/live-activity — proxy for OneSignal's Live Activity REST API,
 * so the REST key stays server-side. Body:
 *   { activityId: string, event: 'update' | 'end', contentState?: object }
 *
 * Deployed with EAS Hosting; set ONESIGNAL_REST_API_KEY (and optionally
 * ONESIGNAL_APP_ID — falls back to the public EXPO_PUBLIC_ONESIGNAL_APP_ID)
 * in the hosting environment.
 *
 * Deliberately unauthenticated like /api/flight-status: activity ids carry a
 * random suffix minted on-device (see services/live-activity.ts), so they
 * aren't guessable from a flight number. The travel-day sharing backend
 * (phase 3) moves this behind authenticated Convex functions.
 */

/** Only the keys the widget renders may pass through. */
const STATE_KEYS = [
  'subtitle',
  'progress',
  'stageLabel',
  'gate',
  'terminal',
  'delayLabel',
  'emphasis',
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

  const body = await request.json().catch(() => null);
  const activityId = typeof body?.activityId === 'string' ? body.activityId : '';
  const event = body?.event;
  if (!activityId || (event !== 'update' && event !== 'end')) {
    return Response.json({ error: 'activityId and event (update|end) are required' }, { status: 400 });
  }

  const eventUpdates: Record<string, unknown> = {};
  for (const key of STATE_KEYS) {
    if (body?.contentState?.[key] !== undefined) eventUpdates[key] = body.contentState[key];
  }
  if (Object.keys(eventUpdates).length === 0) {
    // Ends need the final state too — empty content is what the widget
    // renders while the activity lingers dimmed after ending.
    return Response.json({ error: 'contentState is required' }, { status: 400 });
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
