import { ConvexError } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

export const fileOwner = (ctx: QueryCtx | MutationCtx, storageId: Id<'_storage'>) =>
  ctx.db.query('ownedFiles').withIndex('by_storage', q => q.eq('storageId', storageId)).unique();

export async function requireFileOwner(ctx: MutationCtx, userId: string, storageId: Id<'_storage'>) {
  const owner = await fileOwner(ctx, storageId);
  if (!owner || owner.userId !== userId) throw new ConvexError('Upload this photo again before sharing it.');
}

export async function deleteOwnedFile(ctx: MutationCtx, userId: string, storageId: Id<'_storage'>) {
  const owner = await fileOwner(ctx, storageId);
  // Legacy references cannot prove who uploaded a file. Never let one of
  // those references authorize deletion of bytes belonging to somebody else.
  if (!owner || owner.userId !== userId) return;
  await ctx.storage.delete(storageId);
  await ctx.db.delete(owner._id);
}

export async function ownedFileUrl(ctx: QueryCtx | MutationCtx, userId: string, storageId: Id<'_storage'> | null): Promise<string | null> {
  if (!storageId || (await fileOwner(ctx, storageId))?.userId !== userId) return null;
  return ctx.storage.getUrl(storageId);
}
