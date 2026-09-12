import { mutation, query } from './_generated/server';
import { ConvexError, v } from 'convex/values';
import { bounded, limit, DAY } from './abuse';
import { requireFileOwner, deleteOwnedFile, ownedFileUrl, fileOwner } from './fileOwnership';
import { issueUpload } from './uploads';

import { storageInUse } from './updates';

/** Row shape the client pushes — like journeys.push, no userId: the server
 * stamps identity.subject so nobody can write into another account. */
const photoRow = v.object({
  photoId: v.string(),
  journeyKey: v.string(),
  storageId: v.union(v.id('_storage'), v.null()),
  width: v.union(v.number(), v.null()),
  height: v.union(v.number(), v.null()),
  createdAt: v.string(),
  updatedAt: v.string(),
  deletedAt: v.union(v.string(), v.null()),
});

/** One short-lived URL the client POSTs the image bytes to; the response
 * carries the storageId the row then references. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    return issueUpload(ctx, identity.subject);
  },
});

/** Last-write-wins upsert. A tombstone deletes the stored file too — the
 * bytes must not outlive the photo — and a re-push of the same tombstone is
 * a no-op, so retries are harmless. */
export const push = mutation({
  args: { rows: v.array(photoRow) },
  handler: async (ctx, { rows }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    if (rows.length > 100) throw new ConvexError('Sync at most 100 photos at a time.');
    await limit(ctx, `photo-sync:${identity.subject}`, 3000, DAY, rows.length);
    for (const row of rows) {
      bounded(row.photoId, 100); bounded(row.journeyKey, 200);
      bounded(row.createdAt, 40); bounded(row.updatedAt, 40);
      if (row.deletedAt) bounded(row.deletedAt, 40);
      const existing = await ctx.db
        .query('tripPhotos')
        .withIndex('by_user_photo', (q) =>
          q.eq('userId', identity.subject).eq('photoId', row.photoId),
        )
        .unique();

      if (row.deletedAt) {
        const stored = existing?.storageId ?? null;
        // A photo posted as a trip update shares its file with the update;
        // taking it out of the journal must not blank what followers see.
        if (stored && !(await storageInUse(ctx, stored, { photo: existing?._id })))
          await deleteOwnedFile(ctx, identity.subject, stored);
        const tombstone = { ...row, storageId: null };
        if (!existing) await ctx.db.insert('tripPhotos', { ...tombstone, userId: identity.subject });
        else if (row.updatedAt > existing.updatedAt || existing.storageId)
          await ctx.db.patch(existing._id, tombstone);
        continue;
      }

      if (row.storageId && row.storageId !== existing?.storageId) await requireFileOwner(ctx, identity.subject, row.storageId);
      if (!existing) {
        await ctx.db.insert('tripPhotos', { ...row, userId: identity.subject });
      } else if (row.updatedAt > existing.updatedAt) {
        // A recovered local original restores updates that referenced this
        // exact journal photo. Cross-account legacy references remain quarantined.
        if (existing.storageId && row.storageId && existing.storageId !== row.storageId) {
          const updates = await ctx.db.query('tripUpdates').withIndex('by_storage', q => q.eq('storageId', existing.storageId)).collect();
          for (const update of updates) {
            if (update.userId === identity.subject && update.photoId === row.photoId) await ctx.db.patch(update._id, { storageId: row.storageId, width: row.width, height: row.height });
          }
        }
        // A newer version replacing an older upload frees the old bytes.
        if (
          existing.storageId &&
          existing.storageId !== row.storageId &&
          !(await storageInUse(ctx, existing.storageId, { photo: existing._id }))
        )
          await deleteOwnedFile(ctx, identity.subject, existing.storageId);
        await ctx.db.patch(existing._id, row);
      }
    }
  },
});

/** All of the caller's photo rows, tombstones included, each with a fetch
 * URL for its stored file (null for tombstones). Returns [] while the
 * client's auth is still settling. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const rows = await ctx.db
      .query('tripPhotos')
      .withIndex('by_user', (q) => q.eq('userId', identity.subject))
      .collect();
    return Promise.all(
      rows.map(async (row) => ({
        photoId: row.photoId,
        journeyKey: row.journeyKey,
        storageId: row.storageId,
        width: row.width,
        height: row.height,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt,
        url: await ownedFileUrl(ctx, identity.subject, row.storageId),
        needsUpload: !!row.storageId && !row.deletedAt && (await fileOwner(ctx, row.storageId))?.userId !== identity.subject,
      })),
    );
  },
});
