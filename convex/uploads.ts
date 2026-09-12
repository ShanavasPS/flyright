import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import { httpAction, internalMutation, type MutationCtx } from './_generated/server';
import { limit, DAY } from './abuse';
import { storageInUse } from './updates';
import { boundedBody, imageType, MAX_PHOTO_BYTES } from './uploadShared';

declare const process: { env: Record<string, string | undefined> };

/** Reserve worst-case bytes before issuing a single-use upload capability.
 * Returning a URL keeps the existing native upload protocol compatible. */
export async function issueUpload(ctx: MutationCtx, userId: string) {
  const site = process.env.CONVEX_SITE_URL;
  if (!site) throw new ConvexError('Photo uploads are temporarily unavailable.');
  await limit(ctx, `upload:${userId}`, 30, DAY);
  await limit(ctx, 'upload:global', 500, DAY);
  const owned = await ctx.db.query('ownedFiles').withIndex('by_user', q => q.eq('userId', userId)).take(501);
  if (owned.length >= 500) throw new ConvexError('Your photo storage is full. Remove some photos first.');
  // The bearer ticket is random and bound to the authenticated caller.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const token = Array.from(crypto.getRandomValues(new Uint8Array(48)), b => alphabet[b % alphabet.length]).join('');
  await ctx.db.insert('uploadTickets', { token, userId, expiresAt: Date.now() + 10 * 60_000, state: 'pending' });
  return `${site}/photo-upload?ticket=${token}`;
}

export const claim = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const ticket = await ctx.db.query('uploadTickets').withIndex('by_token', q => q.eq('token', token)).unique();
    if (!ticket || ticket.expiresAt < Date.now() || ticket.state !== 'pending') return null;
    await ctx.db.patch(ticket._id, { state: 'receiving' });
    return ticket._id;
  },
});

export const finish = internalMutation({
  args: { ticketId: v.id('uploadTickets'), storageId: v.id('_storage'), size: v.number() },
  handler: async (ctx, { ticketId, storageId, size }) => {
    const ticket = await ctx.db.get(ticketId);
    if (!ticket || ticket.state !== 'receiving' || ticket.expiresAt < Date.now()) throw new Error('Upload expired');
    const owned = await ctx.db.query('ownedFiles').withIndex('by_user', q => q.eq('userId', ticket.userId)).take(501);
    if (owned.length >= 500) throw new Error('Storage full');
    await ctx.db.insert('ownedFiles', { userId: ticket.userId, storageId, size, createdAt: Date.now() });
    await ctx.db.patch(ticketId, { state: 'complete', storageId });
  },
});

export const photoUpload = httpAction(async (ctx, request) => {
  const token = new URL(request.url).searchParams.get('ticket') ?? '';
  if (!/^[A-Za-z0-9]{48}$/.test(token)) return new Response('Invalid upload', { status: 403 });
  const ticketId = await ctx.runMutation(internal.uploads.claim, { token });
  if (!ticketId) return new Response('Upload expired', { status: 403 });
  let bytes: Uint8Array<ArrayBuffer>;
  try { bytes = await boundedBody(request, MAX_PHOTO_BYTES); }
  catch { return new Response('Photo too large', { status: 413 }); }
  const type = imageType(bytes);
  if (!type) return new Response('Use a JPEG or PNG photo under 40 megapixels', { status: 415 });
  const storageId = await ctx.storage.store(new Blob([bytes], { type }));
  try { await ctx.runMutation(internal.uploads.finish, { ticketId, storageId, size: bytes.length }); }
  catch { await ctx.storage.delete(storageId); return new Response('Upload expired', { status: 403 }); }
  return Response.json({ storageId }, { headers: { 'Cache-Control': 'no-store' } });
});

export const prune = internalMutation({
  args: {},
  handler: async ctx => {
    const expired = await ctx.db.query('uploadTickets').withIndex('by_expiry', q => q.lt('expiresAt', Date.now() - DAY)).take(500);
    for (const ticket of expired) {
      if (ticket.storageId && !(await storageInUse(ctx, ticket.storageId))) {
        const owner = await ctx.db.query('ownedFiles').withIndex('by_storage', q => q.eq('storageId', ticket.storageId!)).unique();
        if (owner && owner.userId === ticket.userId) {
          await ctx.storage.delete(owner.storageId);
          await ctx.db.delete(owner._id);
        }
      }
      await ctx.db.delete(ticket._id);
    }
  },
});
