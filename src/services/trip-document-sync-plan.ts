/** Pure merge planning for kept booking documents — photo-sync-plan.ts's
 * model: local SQLite is the source of truth, rows merge last-write-wins on
 * `updatedAt`, a row is dirty iff syncedAt is unset or older, and an equal
 * stamp on both sides is the fixpoint that stops the loop. */

import type { tripDocuments } from '@/db/schema';

export type TripDocumentRow = typeof tripDocuments.$inferSelect;

/** The wire shape (convex/tripDocuments.ts). `url` only comes back from the server. */
export interface RemoteDocument {
  documentId: string;
  journeyKey: string;
  storageId: string | null;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  url?: string | null;
  needsUpload?: boolean;
}

export function toRemoteDocument(row: TripDocumentRow): Omit<RemoteDocument, 'url' | 'needsUpload'> {
  return {
    documentId: row.id,
    journeyKey: row.journeyId,
    storageId: row.storageId,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function isDocumentDirty(row: Pick<TripDocumentRow, 'updatedAt' | 'syncedAt'>): boolean {
  return row.syncedAt == null || row.updatedAt > row.syncedAt;
}

export interface DocumentSyncPlan {
  /** Local documents whose bytes the server hasn't got: upload, then push. */
  upload: TripDocumentRow[];
  /** Rows (tombstones, or already-uploaded rows) to push as-is. */
  push: TripDocumentRow[];
  /** Remote winners to write locally. */
  apply: RemoteDocument[];
}

export function planDocumentSync(local: TripDocumentRow[], remote: RemoteDocument[]): DocumentSyncPlan {
  const remoteById = new Map(remote.map((r) => [r.documentId, r]));
  const localIds = new Set(local.map((r) => r.id));
  const plan: DocumentSyncPlan = { upload: [], push: [], apply: [] };

  const outbound = (row: TripDocumentRow) => {
    if (row.deletedAt || row.storageId) plan.push.push(row);
    else plan.upload.push(row);
  };

  for (const row of local) {
    const counterpart = remoteById.get(row.id);
    if (counterpart?.needsUpload && !row.deletedAt && !counterpart.deletedAt && row.uri.startsWith('file://')) {
      // The server holds a reference it can't tie to this account: send the
      // bytes again under a stamp newer than both sides.
      const stamp = Math.max(Date.now(), Date.parse(row.updatedAt) + 1, Date.parse(counterpart.updatedAt) + 1);
      plan.upload.push({ ...row, storageId: null, updatedAt: new Date(stamp).toISOString() });
    } else if (!counterpart) {
      if (isDocumentDirty(row)) outbound(row);
    } else if (counterpart.updatedAt > row.updatedAt) {
      plan.apply.push(counterpart);
    } else if (row.updatedAt > counterpart.updatedAt && isDocumentDirty(row)) {
      outbound(row);
    }
    // Equal updatedAt: in sync.
  }
  for (const row of remote) {
    // A tombstone for a document this device never had has nothing to delete.
    if (!localIds.has(row.documentId) && !row.deletedAt) plan.apply.push(row);
  }
  return plan;
}
