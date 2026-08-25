import { httpRouter } from 'convex/server';
import { Webhook } from 'svix';

import { internal } from './_generated/api';
import { httpAction } from './_generated/server';

// The convex/ tsconfig has no Node types; process exists at runtime.
declare const process: { env: Record<string, string | undefined> };

const http = httpRouter();

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

    const payload = await request.text();
    let event: {
      type?: string;
      data?: {
        id?: string;
        first_name?: string | null;
        last_name?: string | null;
        username?: string | null;
        image_url?: string | null;
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
      await ctx.runMutation(internal.users.upsertProfile, {
        userId,
        name,
        imageUrl: d.image_url ?? null,
      });
    }

    return new Response(null, { status: 200 });
  }),
});

export default http;
