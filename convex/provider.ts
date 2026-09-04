/** Durable state behind the metered flight lookups: the shared answer cache
 * and the monthly provider pool.
 *
 * Cloudflare Workers (where the flight-status route runs) and Convex actions
 * (where the travel-day poll chain runs) both have no memory of their own,
 * and both spend the same pool. This module is that memory. The policy it
 * applies is pure and lives in providerShared.ts; here is only the database.
 *
 * `begin`/`record` are the pair every caller uses: `begin` answers "is this
 * already bought, and may you buy it?" in one round trip — cache lookup,
 * pool check and per-caller daily meter together, because the route pays a
 * network hop for each one it makes separately — and `record` files the
 * answer plus what it cost.
 */

import { v } from 'convex/values';

import { internalMutation, mutation, type MutationCtx } from './_generated/server';
import { isPro } from './entitlements';
import {
  budget,
  lookupKey,
  lookupLimit,
  type LookupIdentity,
  type LookupSubject,
} from './lookupShared';
import { configuredMonthlyUnits } from './providerFetch';
import {
  CACHE_MAX_AGE_MS,
  degradationFor,
  maySpend,
  pollStretch,
  poolFrom,
  type Degradation,
} from './providerShared';

declare const process: { env: Record<string, string | undefined> };

/** Who is asking, and how much the wait matters. `interactive` is a person
 * staring at a spinner; `background` is the poll chain; `speculative` is a
 * nicety like the inbound rotation. The pool sheds them in that reverse
 * order as it empties (providerShared.maySpend). */
const callKind = v.union(
  v.literal('interactive'),
  v.literal('background'),
  v.literal('speculative'),
);

/** A request for the base facts, or for the base facts plus the resolved
 * inbound rotation. They are cached separately because the second is a
 * superset — which is also why a base request happily accepts an inbound
 * entry, but not the reverse. */
const variant = v.union(v.literal('base'), v.literal('inbound'));

const subjectArg = v.union(
  v.object({ kind: v.literal('user'), userId: v.string() }),
  v.object({ kind: v.literal('anonymous'), address: v.string() }),
);

export function cacheKey(flight: string, date: string, kind: 'base' | 'inbound'): string {
  return kind === 'inbound' ? `${flight}:${date}:inb` : `${flight}:${date}`;
}

// -- cache --------------------------------------------------------------------

async function readCache(
  ctx: MutationCtx,
  flight: string,
  date: string,
  want: 'base' | 'inbound',
  now: number,
): Promise<string | null> {
  // An inbound request needs the richer entry; a base request takes either,
  // since the extra field costs nothing and the client's type allows it.
  const keys =
    want === 'inbound'
      ? [cacheKey(flight, date, 'inbound')]
      : [cacheKey(flight, date, 'base'), cacheKey(flight, date, 'inbound')];

  for (const key of keys) {
    const row = await ctx.db
      .query('flightFacts')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    if (row && row.expiresAt > now) return row.payload;
  }
  return null;
}

// -- the monthly pool ---------------------------------------------------------

interface Pool {
  remaining: number;
  limit: number;
}

/** What is left of this month's pool. The rules — whose reading wins, and
 * when a reading is about a different plan entirely — are pure and tested in
 * providerShared.poolFrom. */
async function readPool(ctx: MutationCtx, now: number): Promise<Pool> {
  const row = await ctx.db
    .query('providerBudget')
    .withIndex('by_period', (q) => q.eq('period', period(now)))
    .unique();

  return poolFrom(row ?? null, configuredMonthlyUnits(), now);
}

function period(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

async function recordSpend(
  ctx: MutationCtx,
  units: number,
  reported: { remaining: number; limit: number } | null,
  now: number,
): Promise<void> {
  const key = period(now);
  const row = await ctx.db
    .query('providerBudget')
    .withIndex('by_period', (q) => q.eq('period', key))
    .unique();
  const patch = {
    unitsSpent: (row?.unitsSpent ?? 0) + units,
    reportedRemaining: reported?.remaining ?? row?.reportedRemaining ?? null,
    reportedLimit: reported?.limit ?? row?.reportedLimit ?? null,
    reportedAt: reported ? now : (row?.reportedAt ?? null),
    updatedAt: new Date(now).toISOString(),
  };
  if (row) await ctx.db.patch(row._id, patch);
  else await ctx.db.insert('providerBudget', { period: key, ...patch });
}

/** How much to stretch background poll cadence right now.
 *
 * Without this the poll chain runs at full speed until the pool hits the
 * `essential` rung and then stops dead. Stretching first turns that cliff
 * into a slope: the same travel day still gets covered, just with fewer
 * calls, so a thin pool degrades the resolution of live updates instead of
 * ending them. Safe on a QueryCtx too — it only reads. */
export async function poolStretchFactor(ctx: MutationCtx, now: number): Promise<number> {
  const pool = await readPool(ctx, now);
  return pollStretch(degradationFor(pool.remaining, pool.limit));
}

// -- the shared decision ------------------------------------------------------

export type BeginResult =
  | { outcome: 'cached'; payload: string }
  | { outcome: 'permit'; level: Degradation }
  | { outcome: 'refused'; reason: 'quota' | 'budget'; level: Degradation; limit: number };

async function decide(
  ctx: MutationCtx,
  args: {
    flight: string;
    date: string;
    want: 'base' | 'inbound';
    kind: 'interactive' | 'background' | 'speculative';
    cost: number;
    day: string;
    subject: LookupSubject | null;
  },
  now: number,
): Promise<BeginResult> {
  const cached = await readCache(ctx, args.flight, args.date, args.want, now);
  // A cache hit spends neither the pool nor the caller's daily allowance —
  // it costs us nothing, so charging for it would only punish the users who
  // travel on popular routes.
  if (cached) return { outcome: 'cached', payload: cached };

  const pool = await readPool(ctx, now);
  const level = degradationFor(pool.remaining, pool.limit);
  if (!maySpend(level, args.kind)) {
    return { outcome: 'refused', reason: 'budget', level, limit: pool.limit };
  }

  if (args.subject) {
    const key = lookupKey(args.subject, args.day);
    const row = await ctx.db
      .query('lookupQuota')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    const used = row?.count ?? 0;
    const result = budget(used, args.cost, lookupLimit(args.subject));
    if (!result.allowed) {
      return { outcome: 'refused', reason: 'quota', level, limit: result.limit };
    }
    const updatedAt = new Date(now).toISOString();
    if (row) await ctx.db.patch(row._id, { count: used + args.cost, updatedAt });
    else await ctx.db.insert('lookupQuota', { key, day: args.day, count: args.cost, updatedAt });
  }

  return { outcome: 'permit', level };
}

/** Give a caller back allowance they spent on nothing.
 *
 * `decide` charges the daily meter before the provider is called, because it
 * has to — the permit is what authorises the call. When that call then fails
 * for a reason of ours (the provider unwell, or our own monthly pool dry),
 * the caller has paid for an error, and five of those used to be a whole
 * day's allowance spent on nothing. A genuine "no such flight" is not
 * refunded: the provider processed it and bills us either way. */
async function refundQuota(
  ctx: MutationCtx,
  identity: LookupIdentity,
  day: string,
  cost: number,
  now: number,
): Promise<void> {
  if (cost <= 0) return;
  const row = await ctx.db
    .query('lookupQuota')
    .withIndex('by_key', (q) => q.eq('key', lookupKey(identity, day)))
    .unique();
  if (!row) return;
  await ctx.db.patch(row._id, {
    count: Math.max(0, row.count - cost),
    updatedAt: new Date(now).toISOString(),
  });
}

async function store(
  ctx: MutationCtx,
  args: {
    flight: string;
    date: string;
    want: 'base' | 'inbound';
    payload: string | null;
    phase: string;
    expiresAt: number;
    units: number;
    reported: { remaining: number; limit: number } | null;
  },
  now: number,
): Promise<void> {
  await recordSpend(ctx, args.units, args.reported, now);
  // Units spent on a call that yielded nothing cacheable still count.
  if (args.payload === null) return;

  const key = cacheKey(args.flight, args.date, args.want);
  const row = await ctx.db
    .query('flightFacts')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  // Never retain past the terms' 7-day ceiling, whatever the phase TTL says.
  const expiresAt = Math.min(args.expiresAt, now + CACHE_MAX_AGE_MS);
  const fields = { payload: args.payload, phase: args.phase, fetchedAt: now, expiresAt };
  if (row) await ctx.db.patch(row._id, fields);
  else await ctx.db.insert('flightFacts', { key, ...fields });
}

// -- entry points -------------------------------------------------------------

function assertSecret(secret: string): void {
  const expected = process.env.LOOKUP_QUOTA_SECRET;
  if (!expected || secret !== expected) throw new Error('forbidden');
}

/**
 * The flight-status route's one round trip before calling the provider.
 * Secret-gated exactly like lookups.consume: the route has already verified
 * the caller's Clerk token (or decided it is an anonymous web visitor) and
 * passes the resulting subject, so this must never become a public counter.
 */
export const begin = mutation({
  args: {
    secret: v.string(),
    day: v.string(),
    flight: v.string(),
    date: v.string(),
    want: variant,
    kind: callKind,
    cost: v.number(),
    subject: subjectArg,
  },
  handler: async (ctx, { secret, subject, ...args }): Promise<BeginResult> => {
    assertSecret(secret);
    const resolved: LookupSubject =
      subject.kind === 'user'
        ? { kind: 'user', userId: subject.userId, pro: await isPro(ctx, subject.userId) }
        : { kind: 'anonymous', address: subject.address };
    return decide(ctx, { ...args, subject: resolved }, Date.now());
  },
});

/** The route filing what it bought. */
export const record = mutation({
  args: {
    secret: v.string(),
    flight: v.string(),
    date: v.string(),
    want: variant,
    payload: v.union(v.string(), v.null()),
    phase: v.string(),
    expiresAt: v.number(),
    units: v.number(),
    reported: v.union(
      v.object({ remaining: v.number(), limit: v.number() }),
      v.null(),
    ),
    /** Set when the call failed for a reason of ours, to hand the caller
     * back the allowance the permit charged them. */
    refund: v.union(
      v.object({ day: v.string(), cost: v.number(), subject: subjectArg }),
      v.null(),
    ),
  },
  handler: async (ctx, { secret, refund, ...args }) => {
    assertSecret(secret);
    const now = Date.now();
    await store(ctx, args, now);
    if (refund) await refundQuota(ctx, refund.subject, refund.day, refund.cost, now);
  },
});

/** The poll chain's equivalents — same state, no secret, since an internal
 * mutation is unreachable from outside. The chain has no per-caller meter:
 * a live session was already paid for when the trip was created, and it is
 * the pool, not a user allowance, that must hold it back. */
export const beginInternal = internalMutation({
  args: {
    flight: v.string(),
    date: v.string(),
    want: variant,
    kind: callKind,
  },
  handler: async (ctx, args): Promise<BeginResult> =>
    decide(ctx, { ...args, cost: 0, day: '', subject: null }, Date.now()),
});

export const recordInternal = internalMutation({
  args: {
    flight: v.string(),
    date: v.string(),
    want: variant,
    payload: v.union(v.string(), v.null()),
    phase: v.string(),
    expiresAt: v.number(),
    units: v.number(),
    reported: v.union(v.object({ remaining: v.number(), limit: v.number() }), v.null()),
  },
  handler: async (ctx, args) => {
    await store(ctx, args, Date.now());
  },
});

/** Retention sweep. The provider's terms allow keeping a response for at
 * most 7 consecutive days and require deleting it after, so this is a
 * compliance job, not housekeeping — it must keep running. Past-day quota
 * rows go with it, since they are dead weight on the same schedule. */
export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query('flightFacts')
      .withIndex('by_fetchedAt', (q) => q.lt('fetchedAt', now - CACHE_MAX_AGE_MS))
      .take(400);
    for (const row of stale) await ctx.db.delete(row._id);

    const cutoff = new Date(now - 3 * 86_400_000).toISOString().slice(0, 10);
    const old = await ctx.db.query('lookupQuota').take(800);
    for (const row of old) {
      if (row.day < cutoff) await ctx.db.delete(row._id);
    }
    return { facts: stale.length };
  },
});
