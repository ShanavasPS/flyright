import { HOUR } from './abuse';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import { action, internalAction, internalMutation, type MutationCtx, type QueryCtx } from './_generated/server';
import {
  proActive,
  proUntilFromSubscriber,
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

/** Snapshot generations prevent a slower, older response overwriting a refund. */
export const reserveSnapshot = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const row = await ctx.db.query('entitlements').withIndex('by_user', q => q.eq('userId', userId)).unique();
    const generation = (row?.generation ?? 0) + 1;
    if (row) await ctx.db.patch(row._id, { generation });
    else await ctx.db.insert('entitlements', { userId, generation, proUntil: null, source: 'pending', updatedAt: new Date().toISOString() });
    return generation;
  },
});

export const commitSnapshot = internalMutation({
  args: { userId: v.string(), generation: v.number(), proUntil: v.union(v.string(), v.null()) },
  handler: async (ctx, { userId, generation, proUntil }) => {
    const row = await ctx.db.query('entitlements').withIndex('by_user', q => q.eq('userId', userId)).unique();
    if (row?.generation !== generation) return false;
    await setProUntil(ctx, userId, proUntil, 'revenuecat-snapshot');
    return true;
  },
});

export const eventProcessed = internalMutation({
  args: { eventId: v.string(), complete: v.boolean() },
  handler: async (ctx, { eventId, complete }) => {
    const row = await ctx.db.query('revenueCatEvents').withIndex('by_event', q => q.eq('eventId', eventId)).unique();
    if (row) return true;
    if (complete) await ctx.db.insert('revenueCatEvents', { eventId, processedAt: Date.now() });
    return false;
  },
});

async function subscriberSnapshot(userId: string): Promise<string | null> {
  const apiKey = process.env.REVENUECAT_PUBLIC_API_KEY;
  if (!apiKey) throw new Error('RevenueCat is not configured');
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'X-Platform': 'ios' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`RevenueCat snapshot unavailable (${res.status})`);
  const body = await res.json() as { subscriber?: RevenueCatSubscriber };
  if (!body.subscriber) throw new Error('Invalid RevenueCat snapshot');
  return proUntilFromSubscriber(body.subscriber, process.env.REVENUECAT_ALLOW_SANDBOX === 'true');
}

/** Webhooks invalidate a snapshot; their payload never grants Pro. Fetch both
 * sides of transfers, and acknowledge only once every snapshot is stored. */
export const reconcileEvent = internalAction({
  args: { eventId: v.string(), userIds: v.array(v.string()) },
  handler: async (ctx, { eventId, userIds }): Promise<void> => {
    if (await ctx.runMutation(internal.entitlements.eventProcessed, { eventId, complete: false })) return;
    for (const userId of userIds) {
      const generation: number = await ctx.runMutation(internal.entitlements.reserveSnapshot, { userId });
      const proUntil = await subscriberSnapshot(userId);
      const committed: boolean = await ctx.runMutation(internal.entitlements.commitSnapshot, { userId, generation, proUntil });
      if (!committed) throw new Error('Snapshot superseded; retry webhook');
    }
    await ctx.runMutation(internal.entitlements.eventProcessed, { eventId, complete: true });
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
    await ctx.runMutation(internal.abuse.consume, { key: `entitlements:${identity.subject}`, maximum: 20, window: HOUR });
    const generation: number = await ctx.runMutation(internal.entitlements.reserveSnapshot, { userId: identity.subject });
    const proUntil = await subscriberSnapshot(identity.subject);
    await ctx.runMutation(internal.entitlements.commitSnapshot, { userId: identity.subject, generation, proUntil });
    return { pro: proActive(proUntil) };
  },
});
