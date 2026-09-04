import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server';
import { sendFollowerPush } from './onesignal';

declare const process: { env: Record<string, string | undefined> };

/** Settings → Contact support, as a two-way conversation.
 *
 * Traveler → FlyRight: the app writes a message and `deliver` emails it to the
 * support inbox (Cloudflare Email Sending; sends to the verified Email Routing
 * destination are free on every plan).
 *
 * FlyRight → traveler depends on SUPPORT_RELAY (Convex env):
 *
 * - 'off' (default, free tier): the inbox email's Reply-To is the traveler, so
 *   a plain reply reaches them directly. Nothing comes back into the app —
 *   Cloudflare accepts exactly ONE reply_to, so the plus-address can't ride
 *   along.
 * - 'on' (needs Workers Paid + the domain onboarded for Email Sending): the
 *   Reply-To is the thread's plus-address, support+<token>@getflyright.com.
 *   Support's reply lands on the support-mail Worker (workers/support-mail) →
 *   http.ts /support-inbound → `inbound`, which files it as an 'out' message,
 *   pushes the traveler, and `relayToTraveler` emails it to them from
 *   support@ with the same plus-address as Reply-To — so the traveler can
 *   answer by email or in the app and both end up in the thread. */

const MAX_THREADS_PER_HOUR = 5;
const MIN_LENGTH = 10;
const MAX_LENGTH = 4000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORT_DOMAIN = 'getflyright.com';

function supportFrom() {
  return process.env.SUPPORT_FROM ?? `support@${SUPPORT_DOMAIN}`;
}
function relayEnabled() {
  return process.env.SUPPORT_RELAY === 'on';
}
function plusAddress(token: string) {
  return `support+${token}@${SUPPORT_DOMAIN}`;
}

type SendResult = { ok: boolean; emailId: string | null; error: string | null };

/** One Cloudflare Email Sending call. Sends to the verified inbox are free;
 * anything else needs the paid plan (see SUPPORT_RELAY above). */
async function sendEmail(input: {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  inReplyTo: string | null;
}): Promise<SendResult> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_EMAIL_TOKEN;
  if (!accountId || !token) {
    return { ok: false, emailId: null, error: 'Email sending is not configured on this deployment.' };
  }
  const headers: Record<string, string> = {};
  if (input.inReplyTo) {
    headers['In-Reply-To'] = input.inReplyTo;
    headers.References = input.inReplyTo;
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        to: input.to,
        from: supportFrom(),
        reply_to: input.replyTo,
        subject: input.subject,
        text: input.text,
        ...(Object.keys(headers).length ? { headers } : {}),
      }),
    },
  );
  const bodyText = (await res.text()).slice(0, 600);
  try {
    const parsed = JSON.parse(bodyText) as { success?: boolean; result?: { message_id?: string } };
    const ok = res.ok && parsed.success === true;
    return {
      ok,
      emailId: parsed.result?.message_id ?? null,
      error: ok ? null : `HTTP ${res.status}: ${bodyText}`,
    };
  } catch {
    return { ok: false, emailId: null, error: `HTTP ${res.status}: ${bodyText}` };
  }
}

function nowIso() {
  return new Date().toISOString();
}

function preview(body: string) {
  return body.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function subjectFor(body: string) {
  const firstLine = body.split('\n').find((l) => l.trim())?.trim() ?? 'Support request';
  return firstLine.length > 70 ? `${firstLine.slice(0, 67)}…` : firstLine;
}

/** Unguessable plus-address token — lowercase alphanumerics survive every
 * mail client's address normalization. */
function newToken() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 20; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function requireOwnThread(ctx: MutationCtx | { auth: MutationCtx['auth']; db: MutationCtx['db'] }, threadId: Id<'supportThreads'>) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError('Sign in to see your messages.');
  const thread = await ctx.db.get(threadId);
  if (!thread || thread.userId !== identity.subject) throw new ConvexError('Conversation not found.');
  return thread;
}

function validateBody(raw: string) {
  const body = raw.trim();
  if (body.length < MIN_LENGTH) throw new ConvexError('Tell us a little more.');
  if (body.length > MAX_LENGTH) throw new ConvexError('That message is too long.');
  return body;
}

async function appendInbound(ctx: MutationCtx, thread: Doc<'supportThreads'>, body: string) {
  const createdAt = nowIso();
  const id = await ctx.db.insert('supportMessages', {
    threadId: thread._id,
    direction: 'in',
    source: 'app',
    body,
    createdAt,
    deliveredAt: null,
    deliveryError: null,
    emailId: null,
  });
  await ctx.db.patch(thread._id, {
    lastMessageAt: createdAt,
    lastPreview: preview(body),
    lastDirection: 'in',
  });
  await ctx.scheduler.runAfter(0, internal.support.deliver, { id });
  return id;
}

// ---------------------------------------------------------------------------
// Public API (app)

export const startThread = mutation({
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
    const body = validateBody(args.message);
    const email = (identity?.email ?? args.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new ConvexError('Add an email address we can reply to.');

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recent = await ctx.db
      .query('supportThreads')
      .withIndex('by_email_created', (q) => q.eq('email', email).gt('createdAt', hourAgo))
      .take(MAX_THREADS_PER_HOUR);
    if (recent.length >= MAX_THREADS_PER_HOUR) {
      throw new ConvexError("You've sent a few messages already — we'll reply soon.");
    }

    const createdAt = nowIso();
    const threadId = await ctx.db.insert('supportThreads', {
      userId: identity?.subject ?? null,
      email,
      token: newToken(),
      subject: subjectFor(body),
      platform: args.platform.slice(0, 40),
      appVersion: args.appVersion.slice(0, 40),
      createdAt,
      lastMessageAt: createdAt,
      lastPreview: preview(body),
      lastDirection: 'in',
      unreadForUser: false,
      rootEmailId: null,
    });
    const thread = (await ctx.db.get(threadId))!;
    await appendInbound(ctx, thread, body);
    return threadId;
  },
});

export const reply = mutation({
  args: { threadId: v.id('supportThreads'), message: v.string() },
  handler: async (ctx, { threadId, message }) => {
    const thread = await requireOwnThread(ctx, threadId);
    const body = validateBody(message);
    await appendInbound(ctx, thread, body);
  },
});

export const myThreads = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const threads = await ctx.db
      .query('supportThreads')
      .withIndex('by_user_last', (q) => q.eq('userId', identity.subject))
      .order('desc')
      .take(50);
    return threads.map((t) => ({
      id: t._id,
      subject: t.subject,
      lastPreview: t.lastPreview,
      lastMessageAt: t.lastMessageAt,
      lastDirection: t.lastDirection,
      unread: t.unreadForUser,
    }));
  },
});

/** Threads with a support reply the traveler hasn't opened yet — the badge
 * on the home screen's messages button. */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;
    const threads = await ctx.db
      .query('supportThreads')
      .withIndex('by_user_last', (q) => q.eq('userId', identity.subject))
      .order('desc')
      .take(100);
    return threads.filter((t) => t.unreadForUser).length;
  },
});

export const thread = query({
  args: { threadId: v.id('supportThreads') },
  handler: async (ctx, { threadId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const t = await ctx.db.get(threadId);
    if (!t || t.userId !== identity.subject) return null;
    const messages = await ctx.db
      .query('supportMessages')
      .withIndex('by_thread', (q) => q.eq('threadId', threadId))
      .order('asc')
      .take(500);
    return {
      id: t._id,
      subject: t.subject,
      email: t.email,
      unread: t.unreadForUser,
      /** Whether support's replies come back into this thread (SUPPORT_RELAY). */
      relay: relayEnabled(),
      messages: messages.map((m) => ({
        id: m._id,
        direction: m.direction,
        source: m.source,
        body: m.body,
        createdAt: m.createdAt,
        failed: m.direction === 'in' && m.source === 'app' && m.deliveryError !== null,
      })),
    };
  },
});

export const markRead = mutation({
  args: { threadId: v.id('supportThreads') },
  handler: async (ctx, { threadId }) => {
    const t = await requireOwnThread(ctx, threadId);
    if (t.unreadForUser) await ctx.db.patch(t._id, { unreadForUser: false });
  },
});

// ---------------------------------------------------------------------------
// Delivery: app message → support inbox

export const getForDelivery = internalQuery({
  args: { id: v.id('supportMessages') },
  handler: async (ctx, { id }) => {
    const message = await ctx.db.get(id);
    if (!message) return null;
    const t = await ctx.db.get(message.threadId);
    if (!t) return null;
    return { message, thread: t };
  },
});

export const markDelivery = internalMutation({
  args: {
    id: v.id('supportMessages'),
    error: v.union(v.string(), v.null()),
    emailId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { id, error, emailId }) => {
    await ctx.db.patch(id, {
      deliveredAt: error ? null : nowIso(),
      deliveryError: error,
      emailId,
    });
    if (!error && emailId) {
      const message = (await ctx.db.get(id))!;
      const t = await ctx.db.get(message.threadId);
      if (t && !t.rootEmailId) await ctx.db.patch(t._id, { rootEmailId: emailId });
    }
  },
});

export const deliver = internalAction({
  args: { id: v.id('supportMessages') },
  handler: async (ctx, { id }) => {
    const row = await ctx.runQuery(internal.support.getForDelivery, { id });
    if (!row || row.message.deliveredAt || row.message.direction !== 'in') return;
    const { message, thread: t } = row;

    const inbox = process.env.SUPPORT_INBOX;
    if (!inbox) {
      await ctx.runMutation(internal.support.markDelivery, {
        id,
        error: 'SUPPORT_INBOX is not set on this deployment.',
        emailId: null,
      });
      return;
    }

    const relay = relayEnabled();
    const isFirst = !t.rootEmailId;
    const text = [
      message.body,
      '',
      '—',
      `From: ${t.email}`,
      `User: ${t.userId ?? 'anonymous'}`,
      `App: ${t.platform} ${t.appVersion}`,
      `Sent: ${message.createdAt}`,
      '',
      relay
        ? 'Reply normally — your answer reaches the traveler by email and in the app.'
        : 'Reply normally — your answer goes straight to the traveler.',
    ].join('\n');

    const result = await sendEmail({
      to: inbox,
      replyTo: relay ? plusAddress(t.token) : t.email,
      subject: `${isFirst ? '' : 'Re: '}[FlyRight support] ${t.subject}`,
      text,
      inReplyTo: t.rootEmailId,
    });
    await ctx.runMutation(internal.support.markDelivery, {
      id,
      error: result.error,
      emailId: result.emailId,
    });
    if (!result.ok) console.warn('[support] delivery failed', result.error);
  },
});

/** SUPPORT_RELAY=on only: email support's reply to the traveler. */
export const relayToTraveler = internalAction({
  args: { id: v.id('supportMessages') },
  handler: async (ctx, { id }) => {
    const row = await ctx.runQuery(internal.support.getForDelivery, { id });
    if (!row || row.message.direction !== 'out' || !relayEnabled()) return;
    const { message, thread: t } = row;
    const result = await sendEmail({
      to: t.email,
      replyTo: plusAddress(t.token),
      subject: `Re: [FlyRight support] ${t.subject}`,
      text: [message.body, '', '—', 'FlyRight support. Reply to this email or in the app under Settings → Contact support.'].join('\n'),
      inReplyTo: t.rootEmailId,
    });
    if (!result.ok) console.warn('[support] relay to traveler failed', result.error);
  },
});

/** `npx convex run support:retryUndelivered [--prod]` after fixing config. */
export const retryUndelivered = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query('supportMessages')
      .withIndex('by_delivered', (q) => q.eq('deliveredAt', null))
      .take(100);
    let n = 0;
    for (const row of pending) {
      if (row.direction !== 'in' || row.source !== 'app') continue;
      await ctx.scheduler.runAfter(0, internal.support.deliver, { id: row._id });
      n++;
    }
    return n;
  },
});

// ---------------------------------------------------------------------------
// Inbound: email reply → thread (called from http.ts /support-inbound)

/** Keep only the new text of a reply: cut at the first quoted-history marker
 * and drop quoted lines. Heuristic by nature — Gmail wraps its "On … wrote:"
 * line, so look one line ahead. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? '';
    if (/^\s*On .{0,300}wrote:\s*$/.test(line)) break;
    if (/^\s*On .{0,300}$/.test(line) && /wrote:\s*$/.test(next)) break;
    if (/^\s*-{2,}\s*(Original|Forwarded) Message\s*-{2,}/i.test(line)) break;
    if (/^_{8,}\s*$/.test(line)) break;
    if (/^\s*(From|Von|De):\s.+/.test(line) && out.some((l) => l.trim())) break;
    if (line.startsWith('>')) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export const inbound = internalMutation({
  args: {
    token: v.string(),
    from: v.string(),
    subject: v.string(),
    text: v.string(),
    emailId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const t = await ctx.db
      .query('supportThreads')
      .withIndex('by_token', (q) => q.eq('token', args.token.toLowerCase()))
      .unique();
    if (!t) return 'no-thread' as const;

    // Dedupe on Message-ID — Email Routing may deliver a message twice.
    if (args.emailId) {
      const dup = await ctx.db
        .query('supportMessages')
        .withIndex('by_thread', (q) => q.eq('threadId', t._id))
        .filter((q) => q.eq(q.field('emailId'), args.emailId))
        .first();
      if (dup) return 'duplicate' as const;
    }

    const inbox = (process.env.SUPPORT_INBOX ?? '').toLowerCase();
    const sender = args.from.toLowerCase().match(/[^\s<>"]+@[^\s<>"]+/)?.[0] ?? '';
    // Our own notification/relay emails can echo back through the plus-address
    // — they're already in the thread.
    if (sender === supportFrom().toLowerCase()) return 'own-send' as const;
    const fromSupport = sender === inbox;
    const body = stripQuoted(args.text).slice(0, MAX_LENGTH);
    if (!body) return 'empty' as const;

    const createdAt = nowIso();
    const messageId = await ctx.db.insert('supportMessages', {
      threadId: t._id,
      direction: fromSupport ? 'out' : 'in',
      source: 'email',
      body,
      createdAt,
      deliveredAt: createdAt,
      deliveryError: null,
      emailId: args.emailId,
    });
    await ctx.db.patch(t._id, {
      lastMessageAt: createdAt,
      lastPreview: preview(body),
      lastDirection: fromSupport ? 'out' : 'in',
      unreadForUser: fromSupport ? true : t.unreadForUser,
    });
    if (fromSupport && t.userId) {
      await ctx.scheduler.runAfter(0, internal.support.notifyReply, {
        userId: t.userId,
        threadId: t._id,
        body: preview(body),
      });
    }
    if (fromSupport && relayEnabled()) {
      await ctx.scheduler.runAfter(0, internal.support.relayToTraveler, { id: messageId });
    }
    return fromSupport ? ('reply-filed' as const) : ('message-filed' as const);
  },
});

export const notifyReply = internalAction({
  args: { userId: v.string(), threadId: v.id('supportThreads'), body: v.string() },
  handler: async (_ctx, { userId, threadId, body }) => {
    await sendFollowerPush(
      [userId],
      'FlyRight support replied',
      body,
      `https://getflyright.com/messages/${threadId}`,
    );
  },
});
