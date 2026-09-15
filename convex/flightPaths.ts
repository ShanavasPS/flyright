/** Durable state behind the flight-path lookups: the shared answer cache,
 * the month's spending cap and the per-caller daily meter — the same three
 * questions provider.ts answers for the status lookups, for a second
 * provider with its own prices and its own licence. Policy is pure and
 * lives in flightPathShared.ts; here is only the database.
 *
 * Secret-gated like provider.begin/record: the hosting route has already
 * verified who is asking and passes the subject; this is never a public
 * counter or a public fetch.
 */

import { v } from 'convex/values';

import { action, internalMutation, mutation, type MutationCtx } from './_generated/server';
import { configuredMonthlyCents, flightAwareFetch } from './flightPathFetch';
import { PATH_CACHE_MAX_AGE_MS, PATH_LIMITS, pathKey } from './flightPathShared';

declare const process: { env: Record<string, string | undefined> };

const subjectArg = v.union(
  v.object({ kind: v.literal('user'), userId: v.string() }),
  v.object({ kind: v.literal('anonymous'), address: v.string() }),
);

type Subject = { kind: 'user'; userId: string } | { kind: 'anonymous'; address: string };

export type PathBeginResult =
  /** Already bought — the answer, or null for "asked, and there is none". */
  | { outcome: 'cached'; payload: string | null }
  | { outcome: 'permit' }
  | { outcome: 'refused'; reason: 'quota' | 'budget' };

function assertSecret(secret: string): void {
  const expected = process.env.LOOKUP_QUOTA_SECRET;
  if (!expected || secret !== expected) throw new Error('forbidden');
}

const period = (now: number): string => new Date(now).toISOString().slice(0, 7);

/** The daily meter shares the lookupQuota table under its own prefix, so
 * a path lookup never eats into the five status lookups a guest gets. */
const meterKey = (subject: Subject, day: string): string =>
  subject.kind === 'user' ? `path:user:${subject.userId}:${day}` : `path:ip:${subject.address}:${day}`;

async function readBudget(ctx: MutationCtx, now: number) {
  return ctx.db
    .query('flightPathBudget')
    .withIndex('by_period', (q) => q.eq('period', period(now)))
    .unique();
}

async function decide(
  ctx: MutationCtx,
  args: { flight: string; date: string; day: string; subject: Subject },
  now: number,
): Promise<PathBeginResult> {
  const cached = await ctx.db
    .query('flightPaths')
    .withIndex('by_key', (q) => q.eq('key', pathKey(args.flight, args.date)))
    .unique();
  if (cached && cached.expiresAt > now) return { outcome: 'cached', payload: cached.payload };

  const spent = (await readBudget(ctx, now))?.cents ?? 0;
  if (spent >= configuredMonthlyCents()) return { outcome: 'refused', reason: 'budget' };

  const key = meterKey(args.subject, args.day);
  const row = await ctx.db
    .query('lookupQuota')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  const used = row?.count ?? 0;
  const limit = args.subject.kind === 'user' ? PATH_LIMITS.user : PATH_LIMITS.anonymous;
  if (used + 1 > limit) return { outcome: 'refused', reason: 'quota' };
  const updatedAt = new Date(now).toISOString();
  if (row) await ctx.db.patch(row._id, { count: used + 1, updatedAt });
  else await ctx.db.insert('lookupQuota', { key, day: args.day, count: 1, updatedAt });

  return { outcome: 'permit' };
}

async function store(
  ctx: MutationCtx,
  args: {
    flight: string;
    date: string;
    payload: string | null;
    kind: string;
    expiresAt: number;
    cents: number;
    cacheable: boolean;
  },
  now: number,
): Promise<void> {
  if (args.cents > 0) {
    const row = await readBudget(ctx, now);
    const updatedAt = new Date(now).toISOString();
    if (row) await ctx.db.patch(row._id, { cents: row.cents + args.cents, updatedAt });
    else await ctx.db.insert('flightPathBudget', { period: period(now), cents: args.cents, updatedAt });
  }
  // A call that cost money but produced no answer worth keeping (an outage)
  // is charged and nothing else; "asked, nothing there" IS an answer.
  if (!args.cacheable) return;

  const key = pathKey(args.flight, args.date);
  const row = await ctx.db
    .query('flightPaths')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  // Never retain past the licence's thirty days, whatever the TTL says.
  const expiresAt = Math.min(args.expiresAt, now + PATH_CACHE_MAX_AGE_MS);
  const fields = { payload: args.payload, kind: args.kind, fetchedAt: now, expiresAt };
  if (row) await ctx.db.patch(row._id, fields);
  else await ctx.db.insert('flightPaths', { key, ...fields });
}

/** The route's one round trip before calling the provider. */
export const begin = mutation({
  args: {
    secret: v.string(),
    day: v.string(),
    flight: v.string(),
    date: v.string(),
    subject: subjectArg,
  },
  handler: async (ctx, { secret, ...args }): Promise<PathBeginResult> => {
    assertSecret(secret);
    return decide(ctx, args, Date.now());
  },
});

/** One provider call, made from Convex on the route's behalf — the hosting
 * worker's own fetches to the status provider were refused in 2026-09, so
 * the route asks Convex for both providers alike. */
export const fetchPath = action({
  args: { secret: v.string(), path: v.string() },
  handler: async (_ctx, { secret, path }) => {
    assertSecret(secret);
    return await flightAwareFetch(path);
  },
});

/** The route filing what it bought. */
export const record = mutation({
  args: {
    secret: v.string(),
    flight: v.string(),
    date: v.string(),
    payload: v.union(v.string(), v.null()),
    kind: v.string(),
    expiresAt: v.number(),
    cents: v.number(),
    cacheable: v.boolean(),
  },
  handler: async (ctx, { secret, ...args }) => {
    assertSecret(secret);
    await store(ctx, args, Date.now());
  },
});

/** Retention sweep: the licence allows keeping the provider's data for at
 * most thirty days from receipt. A compliance job, not housekeeping. */
export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query('flightPaths')
      .withIndex('by_fetchedAt', (q) => q.lt('fetchedAt', now - PATH_CACHE_MAX_AGE_MS))
      .take(400);
    for (const row of stale) await ctx.db.delete(row._id);
    return { paths: stale.length };
  },
});
