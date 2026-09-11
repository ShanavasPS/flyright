/** Block and report: the two things a traveler can do about someone they
 * don't want in their travel life. Blocking is total and silent (see
 * safetyHelpers.blockedBetween for every door it closes); reporting files a
 * row and mails the support inbox, where a human decides. Both are what the
 * stores expect of an app where people see each other's photos and words. */

import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { personCard } from './circle';
import { severCircle } from './liveHelpers';
import { sendEmail } from './support';

declare const process: { env: Record<string, string | undefined> };

const MAX_REPORTS_PER_DAY = 20;
const MAX_DETAILS = 1000;

/** The reasons the report sheet offers, in its order. */
export const REPORT_REASONS = ['scam', 'impersonation', 'harassment', 'inappropriate', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

async function requireIdentity(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Not authenticated');
  return identity;
}

/** Shut someone out. Idempotent. Severs the circle both ways and closes any
 * open request between the two so neither side keeps a stale offer around;
 * the blocked person gets no push and sees no change beyond a profile that
 * has "stopped sharing". */
export const block = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const me = (await requireIdentity(ctx)).subject;
    if (userId === me) throw new Error('Own account');
    const existing = await ctx.db
      .query('blocks')
      .withIndex('by_blocker_blocked', (q) => q.eq('blockerId', me).eq('blockedId', userId))
      .unique();
    const now = new Date().toISOString();
    if (!existing) await ctx.db.insert('blocks', { blockerId: me, blockedId: userId, createdAt: now });

    await severCircle(ctx, me, userId);
    await severCircle(ctx, userId, me);
    for (const [from, to] of [
      [me, userId],
      [userId, me],
    ]) {
      const rows = await ctx.db
        .query('circleRequests')
        .withIndex('by_pair', (q) => q.eq('fromUserId', from).eq('toUserId', to))
        .collect();
      for (const r of rows) {
        if (r.status === 'pending') await ctx.db.patch(r._id, { status: 'declined', respondedAt: now });
      }
    }
    return { blocked: true as const };
  },
});

/** Lift a block. The circle does not come back — either side can offer again. */
export const unblock = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const me = (await requireIdentity(ctx)).subject;
    const row = await ctx.db
      .query('blocks')
      .withIndex('by_blocker_blocked', (q) => q.eq('blockerId', me).eq('blockedId', userId))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});

/** Whether I have blocked this person — the profile page's "Blocked" state. */
export const iBlocked = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;
    const row = await ctx.db
      .query('blocks')
      .withIndex('by_blocker_blocked', (q) => q.eq('blockerId', identity.subject).eq('blockedId', userId))
      .unique();
    return !!row;
  },
});

/** Settings → Blocked people: the only place a blocked person can be found
 * again, since search and every list hide them. */
export const blockedPeople = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const rows = await ctx.db
      .query('blocks')
      .withIndex('by_blocker_blocked', (q) => q.eq('blockerId', identity.subject))
      .collect();
    const people = [];
    for (const row of rows) {
      const who = await personCard(ctx, row.blockedId);
      people.push({ userId: row.blockedId, name: who.name, imageUrl: who.imageUrl, since: row.createdAt });
    }
    return people.sort((a, b) => b.since.localeCompare(a.since));
  },
});

/** File a report about a person or one of their updates. Capped per day so
 * the inbox can't be flooded; the reporter is not told the outcome. The
 * open share page never learns a traveler's id, so a report about an update
 * may come with no `userId` — the update names its author. */
export const report = mutation({
  args: {
    userId: v.union(v.string(), v.null()),
    updateId: v.union(v.id('tripUpdates'), v.null()),
    reason: v.union(...REPORT_REASONS.map((r) => v.literal(r))),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    const { updateId, reason, details } = args;
    const me = (await requireIdentity(ctx)).subject;
    let userId = args.userId;
    if (updateId) {
      const update = await ctx.db.get(updateId);
      if (!update || (userId && update.userId !== userId)) throw new ConvexError('That update is no longer there.');
      userId = update.userId;
    }
    if (!userId) throw new ConvexError('Nothing to report.');
    if (userId === me) throw new Error('Own account');
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recent = await ctx.db
      .query('reports')
      .withIndex('by_reporter_created', (q) => q.eq('reporterId', me).gt('createdAt', dayAgo))
      .take(MAX_REPORTS_PER_DAY);
    if (recent.length >= MAX_REPORTS_PER_DAY) {
      throw new ConvexError("You've sent several reports today — we're looking at them.");
    }

    let snapshot: string | null = null;
    if (updateId) {
      const update = (await ctx.db.get(updateId))!;
      snapshot = JSON.stringify({ text: update.text, storageId: update.storageId ?? null, createdAt: update.createdAt });
    }
    const id = await ctx.db.insert('reports', {
      reporterId: me,
      targetUserId: userId,
      updateId,
      reason,
      details: details.trim().slice(0, MAX_DETAILS),
      snapshot,
      status: 'open',
      createdAt: new Date().toISOString(),
      deliveredAt: null,
    });
    await ctx.scheduler.runAfter(0, internal.safety.deliverReport, { id });
    return { reported: true as const, targetUserId: userId };
  },
});

export const reportRow = internalMutation({
  args: { id: v.id('reports'), deliveredAt: v.union(v.string(), v.null()) },
  handler: async (ctx, { id, deliveredAt }) => {
    if (deliveredAt) await ctx.db.patch(id, { deliveredAt });
    return await ctx.db.get(id);
  },
});

/** Mail the report to the support inbox. Names, not ids, in the subject;
 * ids in the body so the row can be found. A failed send leaves
 * deliveredAt null — the row itself is the record. */
export const deliverReport = internalAction({
  args: { id: v.id('reports') },
  handler: async (ctx, { id }) => {
    const row = await ctx.runMutation(internal.safety.reportRow, { id, deliveredAt: null });
    if (!row) return;
    const inbox = process.env.SUPPORT_INBOX;
    if (!inbox) return;
    const target = await ctx.runQuery(internal.safety.nameOf, { userId: row.targetUserId });
    const reporter = await ctx.runQuery(internal.safety.nameOf, { userId: row.reporterId });
    const lines = [
      `Reason: ${row.reason}`,
      `Reported: ${target} (${row.targetUserId})`,
      `By: ${reporter} (${row.reporterId})`,
      row.updateId ? `Update: ${row.updateId}` : 'About: the person',
      row.snapshot ? `Snapshot: ${row.snapshot}` : null,
      '',
      row.details || '(no details)',
      '',
      `Report id: ${row._id}`,
    ].filter((l): l is string => l !== null);
    const sent = await sendEmail({
      to: inbox,
      replyTo: inbox,
      subject: `[report] ${row.reason}${row.updateId ? ' (trip update)' : ''} — ${target}`,
      text: lines.join('\n'),
      inReplyTo: null,
    });
    if (sent.ok) {
      await ctx.runMutation(internal.safety.reportRow, { id, deliveredAt: new Date().toISOString() });
    } else {
      console.warn('[safety] report email failed', sent.error);
    }
  },
});

export const nameOf = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => (await personCard(ctx, userId)).name,
});
