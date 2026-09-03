import { v } from 'convex/values';

import { internal } from './_generated/api';
import { action, internalMutation, type MutationCtx, type QueryCtx } from './_generated/server';
import {
  entitlementChange,
  proActive,
  proUntilFromSubscriber,
  type RevenueCatEvent,
  type RevenueCatSubscriber,
} from './entitlementShared';

// The convex/ tsconfig has no Node types; process exists at runtime.
declare const process: { env: Record<string, string | undefined> };

/** Server-side view of RevenueCat's 'Owed Pro' entitlement — see the
 * entitlements table in schema.ts and the /rc-webhook route in http.ts.
 * Anything the server enforces for free vs Pro (the circle size cap in
 * circle.ts) asks here, never the client. */

export async function isPro(ctx: QueryCtx | MutationCtx, userId: string): Promise<boolean> {
  const row = await ctx.db
    .query('entitlements')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  return proActive(row?.proUntil);
}

async function setProUntil(ctx: MutationCtx, userId: string, proUntil: string | null, source: string) {
  const existing = await ctx.db
    .query('entitlements')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  const updatedAt = new Date().toISOString();
  if (existing) await ctx.db.patch(existing._id, { proUntil, source, updatedAt });
  else await ctx.db.insert('entitlements', { userId, proUntil, source, updatedAt });
}

/** Apply one RC webhook event. Idempotent: replaying an event writes the
 * same proUntil again. */
export const applyRevenueCatEvent = internalMutation({
  args: {
    event: v.object({
      type: v.string(),
      app_user_id: v.string(),
      aliases: v.optional(v.union(v.array(v.string()), v.null())),
      entitlement_ids: v.optional(v.union(v.array(v.string()), v.null())),
      expiration_at_ms: v.optional(v.union(v.number(), v.null())),
      transferred_from: v.optional(v.union(v.array(v.string()), v.null())),
      transferred_to: v.optional(v.union(v.array(v.string()), v.null())),
    }),
  },
  handler: async (ctx, { event }) => {
    const change = entitlementChange(event as RevenueCatEvent);
    if (!change) return 0;
    for (const userId of change.userIds) {
      await setProUntil(ctx, userId, change.proUntil, event.type);
    }
    return change.userIds.length;
  },
});

/** Manual grant/revoke — backfilling customers who bought before the webhook
 * existed, or dev-deployment testing (`npx convex run entitlements:set …`). */
export const set = internalMutation({
  args: {
    userId: v.string(),
    proUntil: v.union(v.string(), v.null()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, { userId, proUntil, source }) => {
    await setProUntil(ctx, userId, proUntil, source ?? 'manual');
  },
});

/**
 * Pull the caller's entitlement straight from RevenueCat and store it. The
 * webhook is the steady state; this covers the gaps it can't: purchases made
 * before the webhook existed, and an anonymous purchase later aliased to a
 * Clerk id by Purchases.logIn (no event fires for the alias, and a yearly or
 * lifetime plan may never send another). GET /v1/subscribers accepts the
 * public SDK key — the same one the app ships — and the id comes from the
 * JWT, so nobody can refresh anyone else's row. Client: EntitlementSync.
 */
export const refreshMine = action({
  args: {},
  handler: async (ctx): Promise<{ pro: boolean } | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const apiKey = process.env.REVENUECAT_PUBLIC_API_KEY;
    if (!apiKey) {
      console.warn('[entitlements] REVENUECAT_PUBLIC_API_KEY unset; refresh skipped');
      return null;
    }
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(identity.subject)}`,
      { headers: { Authorization: `Bearer ${apiKey}`, 'X-Platform': 'ios' } },
    );
    if (!res.ok) {
      console.warn(`[entitlements] RC subscriber lookup ${res.status} for ${identity.subject}`);
      return null;
    }
    const body = (await res.json()) as { subscriber?: RevenueCatSubscriber };
    const proUntil = proUntilFromSubscriber(body.subscriber ?? {});
    await ctx.runMutation(internal.entitlements.set, {
      userId: identity.subject,
      proUntil,
      source: 'refresh',
    });
    return { pro: proActive(proUntil) };
  },
});
