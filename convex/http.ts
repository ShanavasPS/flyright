import { httpRouter } from 'convex/server';
import { Webhook } from 'svix';

import { internal } from './_generated/api';
import { httpAction } from './_generated/server';
import { boundedBody } from './uploadShared';
import { photoUpload } from './uploads';

// The convex/ tsconfig has no Node types; process exists at runtime.
declare const process: { env: Record<string, string | undefined> };

const http = httpRouter();
http.route({ path: '/photo-upload', method: 'POST', handler: photoUpload });

/**
 * Clerk webhook receiver. Configure in the Clerk dashboard (Webhooks → Add
 * endpoint) pointing at https://<deployment>.convex.site/clerk-webhook with
 * the user.deleted event subscribed, and set that endpoint's signing secret
 * as CLERK_WEBHOOK_SECRET on this deployment. Account deletion then purges
 * the user's synced rows, as the store account-deletion policies expect.
 */
http.route({
  path: '/clerk-webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) return new Response('webhook not configured', { status: 503 });

    let payload: string;
    try { payload = new TextDecoder().decode(await boundedBody(request, 256 * 1024)); }
    catch { return new Response('body too large', { status: 413 }); }
    let event: {
      type?: string;
      data?: {
        id?: string;
        first_name?: string | null;
        last_name?: string | null;
        username?: string | null;
        image_url?: string | null;
        primary_email_address_id?: string | null;
        email_addresses?: { id?: string; email_address?: string; verification?: { status?: string } }[];
      };
    };
    try {
      event = new Webhook(secret).verify(payload, {
        'svix-id': request.headers.get('svix-id') ?? '',
        'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
        'svix-signature': request.headers.get('svix-signature') ?? '',
      }) as typeof event;
    } catch {
      return new Response('invalid signature', { status: 400 });
    }

    if (event.type === 'user.deleted' && event.data?.id) {
      const purged = await ctx.runMutation(internal.users.purge, { userId: event.data.id });
      console.log(`[clerk-webhook] user.deleted ${event.data.id}: purged ${purged} journeys`);
    }

    // Display names for follower-facing copy ("Sam is through security").
    // Subscribe user.created + user.updated on the same Clerk endpoint.
    if ((event.type === 'user.created' || event.type === 'user.updated') && event.data?.id) {
      const d = event.data;
      const userId = event.data.id;
      const name = d.first_name?.trim() || d.username?.trim() || 'A traveler';
      // The address is how someone finds them in "add someone" — it is
      // stored lowercased and never returned to another user (circle.ts).
      const emails = d.email_addresses ?? [];
      const primary =
        emails.find((e) => e.id && e.id === d.primary_email_address_id) ?? emails[0];
      const { newEmail } = await ctx.runMutation(internal.users.upsertProfile, {
        userId,
        name,
        imageUrl: d.image_url ?? null,
        email: primary?.email_address ?? null,
        emailVerified: primary?.verification?.status === 'verified',
      });
      // First verified address → OneSignal email subscription → the welcome
      // Journey. Off the request path so a slow OneSignal never fails Clerk.
      if (newEmail) {
        await ctx.scheduler.runAfter(0, internal.welcome.subscribeEmail, { userId, email: newEmail });
      }
    }

    return new Response(null, { status: 200 });
  }),
});

/**
 * RevenueCat webhook receiver — mirrors the 'Owed Pro' entitlement into the
 * entitlements table so server-enforced limits (free circle size) can check
 * it. Configure in RevenueCat (Integrations → Webhooks) pointing at
 * https://<deployment>.convex.site/rc-webhook with an Authorization header
 * value, and set that same value as REVENUECAT_WEBHOOK_AUTH on the
 * deployment. RC retries non-2xx responses, so a misconfigured secret shows
 * up as a growing retry queue in their dashboard rather than silent loss.
 */
http.route({
  path: '/rc-webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (!secret) return new Response('webhook not configured', { status: 503 });
    if (request.headers.get('authorization') !== secret) {
      return new Response('unauthorized', { status: 401 });
    }

    let event: Record<string, unknown>;
    try { event = JSON.parse(new TextDecoder().decode(await boundedBody(request, 128 * 1024))).event; }
    catch { return new Response('invalid body', { status: 400 }); }
    if (!event || typeof event.type !== 'string') return new Response('invalid event', { status: 400 });
    if (event.type === 'TEST') return new Response(null, { status: 200 });
    if (event.environment === 'SANDBOX' && process.env.REVENUECAT_ALLOW_SANDBOX !== 'true') return new Response(null, { status: 200 });
    if (typeof event.id !== 'string' || event.id.length > 200 || !['PRODUCTION', 'SANDBOX'].includes(String(event.environment))) return new Response('invalid event', { status: 400 });
    const ids = [event.app_user_id, ...['aliases', 'transferred_from', 'transferred_to'].flatMap(key => Array.isArray(event[key]) ? event[key] as unknown[] : [])];
    const userIds = [...new Set(ids.filter((id): id is string => typeof id === 'string' && /^user_[A-Za-z0-9]{1,100}$/.test(id)))];
    if (userIds.length > 100) return new Response('too many users', { status: 400 });
    try { await ctx.runAction(internal.entitlements.reconcileEvent, { eventId: event.id, userIds }); }
    catch { return new Response('snapshot unavailable; retry', { status: 503 }); }
    return new Response(null, { status: 200 });
  }),
});

/**
 * Inbound support email, posted by the support-mail Email Worker
 * (workers/support-mail) for anything addressed to support+<token>@. Shared
 * secret lives as SUPPORT_INBOUND_SECRET here and INBOUND_SECRET on the Worker.
 */
http.route({
  path: '/support-inbound',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.SUPPORT_INBOUND_SECRET;
    if (!secret) return new Response('inbound not configured', { status: 503 });
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return new Response('unauthorized', { status: 401 });
    }
    let body: {
      token?: string;
      from?: string;
      fromHeader?: string | null;
      authResults?: string | null;
      subject?: string;
      text?: string;
      emailId?: string | null;
    };
    try {
      body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 64 * 1024)));
    } catch {
      return new Response('invalid json', { status: 400 });
    }
    if (typeof body.token !== 'string' || typeof body.from !== 'string') {
      return new Response('token and from required', { status: 400 });
    }
    const outcome = await ctx.runMutation(internal.support.inbound, {
      token: body.token,
      from: body.from,
      fromHeader: typeof body.fromHeader === 'string' ? body.fromHeader : null,
      authResults: typeof body.authResults === 'string' ? body.authResults : null,
      subject: typeof body.subject === 'string' ? body.subject : '',
      text: typeof body.text === 'string' ? body.text : '',
      emailId: typeof body.emailId === 'string' ? body.emailId : null,
    });
    console.log(`[support-inbound] ${body.token}: ${outcome}`);
    return Response.json({ outcome }, { status: outcome === 'no-thread' ? 404 : 200 });
  }),
});

export default http;
