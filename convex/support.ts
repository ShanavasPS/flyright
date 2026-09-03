import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery, mutation } from './_generated/server';

declare const process: { env: Record<string, string | undefined> };

/** Settings → Contact support. The message lands in the support inbox as an
 * email with Reply-To set to the traveler, so answering from a normal mail
 * client closes the loop. Delivery goes through Cloudflare Email Sending
 * (support@getflyright.com is on the getflyright.com zone; sends to the
 * verified Email Routing destination are free on every plan). */

const MAX_PER_HOUR = 5;
const MIN_LENGTH = 10;
const MAX_LENGTH = 4000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const submit = mutation({
  args: {
    message: v.string(),
    /** Only consulted when the caller is anonymous — a signed-in user's
     * Clerk email always wins, so a typo here can't strand the reply. */
    email: v.union(v.string(), v.null()),
    platform: v.string(),
    appVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const message = args.message.trim();
    if (message.length < MIN_LENGTH) throw new ConvexError('Tell us a little more.');
    if (message.length > MAX_LENGTH) throw new ConvexError('That message is too long.');

    const email = (identity?.email ?? args.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new ConvexError('Add an email address we can reply to.');

    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const recent = await ctx.db
      .query('supportMessages')
      .withIndex('by_email_created', (q) => q.eq('email', email).gt('createdAt', hourAgo))
      .take(MAX_PER_HOUR);
    if (recent.length >= MAX_PER_HOUR) {
      throw new ConvexError("You've sent a few messages already — we'll reply soon.");
    }

    const id = await ctx.db.insert('supportMessages', {
      userId: identity?.subject ?? null,
      email,
      message,
      platform: args.platform.slice(0, 40),
      appVersion: args.appVersion.slice(0, 40),
      createdAt: now.toISOString(),
      deliveredAt: null,
      deliveryError: null,
    });
    await ctx.scheduler.runAfter(0, internal.support.deliver, { id });
  },
});

export const deliver = internalAction({
  args: { id: v.id('supportMessages') },
  handler: async (ctx, { id }) => {
    const row = await ctx.runQuery(internal.support.get, { id });
    if (!row || row.deliveredAt) return;

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const token = process.env.CLOUDFLARE_EMAIL_TOKEN;
    const inbox = process.env.SUPPORT_INBOX;
    const from = process.env.SUPPORT_FROM ?? 'support@getflyright.com';
    if (!accountId || !token || !inbox) {
      await ctx.runMutation(internal.support.markDelivery, {
        id,
        error: 'Email sending is not configured on this deployment.',
      });
      return;
    }

    const subject = `[FlyRight support] ${row.email} · ${row.platform} ${row.appVersion}`;
    const text = [
      row.message,
      '',
      '—',
      `From: ${row.email}`,
      `User: ${row.userId ?? 'anonymous'}`,
      `App: ${row.platform} ${row.appVersion}`,
      `Sent: ${row.createdAt}`,
    ].join('\n');

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          to: inbox,
          from,
          reply_to: row.email,
          subject,
          text,
        }),
      },
    );
    const body = (await res.text()).slice(0, 500);
    const ok = res.ok && /"success":\s*true/.test(body);
    await ctx.runMutation(internal.support.markDelivery, {
      id,
      error: ok ? null : `HTTP ${res.status}: ${body}`,
    });
    if (!ok) console.warn('[support] delivery failed', res.status, body);
  },
});

export const get = internalQuery({
  args: { id: v.id('supportMessages') },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const markDelivery = internalMutation({
  args: { id: v.id('supportMessages'), error: v.union(v.string(), v.null()) },
  handler: async (ctx, { id, error }) => {
    await ctx.db.patch(id, {
      deliveredAt: error ? null : new Date().toISOString(),
      deliveryError: error,
    });
  },
});

/** `npx convex run support:retryUndelivered` after fixing configuration. */
export const retryUndelivered = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query('supportMessages')
      .withIndex('by_delivered', (q) => q.eq('deliveredAt', null))
      .take(100);
    for (const row of pending) {
      await ctx.scheduler.runAfter(0, internal.support.deliver, { id: row._id });
    }
    return pending.length;
  },
});
