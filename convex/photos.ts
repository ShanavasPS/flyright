import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

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
    return ctx.storage.generateUploadUrl();
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

    for (const row of rows) {
      const existing = await ctx.db
        .query('tripPhotos')
        .withIndex('by_user_photo', (q) =>
          q.eq('userId', identity.subject).eq('photoId', row.photoId),
        )
        .unique();

      if (row.deletedAt) {
        const stored = row.storageId ?? existing?.storageId ?? null;
        if (stored) await ctx.storage.delete(stored).catch(() => {});
        const tombstone = { ...row, storageId: null };
        if (!existing) await ctx.db.insert('tripPhotos', { ...tombstone, userId: identity.subject });
        else if (row.updatedAt > existing.updatedAt || existing.storageId)
          await ctx.db.patch(existing._id, tombstone);
        continue;
      }

      if (!existing) {
        await ctx.db.insert('tripPhotos', { ...row, userId: identity.subject });
      } else if (row.updatedAt > existing.updatedAt) {
        // A newer version replacing an older upload frees the old bytes.
        if (existing.storageId && existing.storageId !== row.storageId)
          await ctx.storage.delete(existing.storageId).catch(() => {});
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
        url: row.storageId ? await ctx.storage.getUrl(row.storageId) : null,
      })),
    );
  },
});
