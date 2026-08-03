/**
 * POST /api/rc-webhook — RevenueCat webhook receiver.
 *
 * Configure in the RevenueCat dashboard with an Authorization header value,
 * mirrored in the RC_WEBHOOK_AUTH env var on EAS Hosting. Used for
 * #BuildInPublic revenue metrics and OneSignal journey triggers — the app
 * itself never depends on this endpoint.
 */
export async function POST(request: Request) {
  const auth = request.headers.get('authorization');
  if (!process.env.RC_WEBHOOK_AUTH || auth !== process.env.RC_WEBHOOK_AUTH) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { event } = await request.json();
  console.log('[rc-webhook]', event?.type, event?.product_id, event?.price_in_purchased_currency);

  return Response.json({ ok: true });
}
