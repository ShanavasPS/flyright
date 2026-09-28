import { mutation, query } from './_generated/server';
import { ConvexError, v } from 'convex/values';
import { bounded, limit, DAY } from './abuse';
import { deleteOwnedFile, fileOwner, ownedFileUrl } from './fileOwnership';
import { storageInUse } from './updates';
import { issueUpload } from './uploads';
import { MAX_DOCUMENT_BYTES } from './uploadShared';

/** The booking documents trips were imported from — photos.ts's model for a
 * PDF: the client pushes rows without a userId (the server stamps
 * identity.subject), a tombstone frees the stored file, and only the owner
 * ever gets a URL for one. */
const documentRow = v.object({
  documentId: v.string(),
  journeyKey: v.string(),
  storageId: v.union(v.id('_storage'), v.null()),
  name: v.string(),
  mimeType: v.string(),
  size: v.number(),
  createdAt: v.string(),
  updatedAt: v.string(),
  deletedAt: v.union(v.string(), v.null()),
});

const MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

/** One short-lived URL the client POSTs the document's bytes to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    return issueUpload(ctx, identity.subject, 'document-upload');
  },
});

/** Last-write-wins upsert, as photos.push. A row pointing at a file this
 * account did not upload is skipped and named in `rejected`; the app then
 * uploads that document afresh. */
export const push = mutation({
  args: { rows: v.array(documentRow) },
  handler: async (ctx, { rows }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const userId = identity.subject;

    if (rows.length > 100) throw new ConvexError('Sync at most 100 documents at a time.');
    await limit(ctx, `document-sync:${userId}`, 3000, DAY, rows.length);
    const rejected: string[] = [];
    for (const row of rows) {
      bounded(row.documentId, 100); bounded(row.journeyKey, 200); bounded(row.name, 200);
      bounded(row.createdAt, 40); bounded(row.updatedAt, 40);
      if (row.deletedAt) bounded(row.deletedAt, 40);
      if (!MIME_TYPES.has(row.mimeType)) throw new ConvexError('Keep a PDF, JPEG or PNG document.');
      if (!(row.size >= 0 && row.size <= MAX_DOCUMENT_BYTES)) throw new ConvexError('Keep a document under 20 MB.');
      const existing = await ctx.db
        .query('tripDocuments')
        .withIndex('by_user_document', (q) => q.eq('userId', userId).eq('documentId', row.documentId))
        .unique();

      if (row.deletedAt) {
        const stored = existing?.storageId ?? null;
        if (stored && !(await storageInUse(ctx, stored, { document: existing?._id })))
          await deleteOwnedFile(ctx, userId, stored);
        const tombstone = { ...row, storageId: null };
        if (!existing) await ctx.db.insert('tripDocuments', { ...tombstone, userId });
        else if (row.updatedAt > existing.updatedAt || existing.storageId)
          await ctx.db.patch(existing._id, tombstone);
        continue;
      }

      if (
        row.storageId &&
        row.storageId !== existing?.storageId &&
        (await fileOwner(ctx, row.storageId))?.userId !== userId
      ) {
        console.warn(`[tripDocuments] push skipped ${row.documentId}: file not owned by the caller`);
        rejected.push(row.documentId);
        continue;
      }
      if (!existing) {
        await ctx.db.insert('tripDocuments', { ...row, userId });
      } else if (row.updatedAt > existing.updatedAt) {
        // A newer upload replacing an older one frees the old bytes.
        if (
          existing.storageId &&
          existing.storageId !== row.storageId &&
          !(await storageInUse(ctx, existing.storageId, { document: existing._id }))
        )
          await deleteOwnedFile(ctx, userId, existing.storageId);
        await ctx.db.patch(existing._id, row);
      }
    }
    return { rejected };
  },
});

/** All of the caller's document rows, tombstones included, each with a fetch
 * URL for its file (null for tombstones). [] while auth is still settling. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const rows = await ctx.db
      .query('tripDocuments')
      .withIndex('by_user', (q) => q.eq('userId', identity.subject))
      .collect();
    return Promise.all(
      rows.map(async (row) => ({
        documentId: row.documentId,
        journeyKey: row.journeyKey,
        storageId: row.storageId,
        name: row.name,
        mimeType: row.mimeType,
        size: row.size,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt,
        url: await ownedFileUrl(ctx, identity.subject, row.storageId),
        needsUpload:
          !!row.storageId && !row.deletedAt && (await fileOwner(ctx, row.storageId))?.userId !== identity.subject,
      })),
    );
  },
});
