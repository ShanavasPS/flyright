/** Pure merge planning for trip-photo sync — no I/O, so it's unit-testable
 * (the file and picker work lives in services/photos.ts). Same model as
 * sync-merge.ts: local SQLite is the source of truth, rows merge last-write-
 * wins on `updatedAt`, a row is dirty iff syncedAt is unset or older, and an
 * equal stamp on both sides is the fixpoint that stops the loop. */

import type { tripPhotos } from '@/db/schema';

export type TripPhotoRow = typeof tripPhotos.$inferSelect;

/** The wire shape (convex/photos.ts). `url` only comes back from the server. */
export interface RemotePhoto {
  photoId: string;
  journeyKey: string;
  storageId: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  url?: string | null;
}

export function toRemotePhoto(row: TripPhotoRow): Omit<RemotePhoto, 'url'> {
  return {
    photoId: row.id,
    journeyKey: row.journeyId,
    storageId: row.storageId,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function isPhotoDirty(row: Pick<TripPhotoRow, 'updatedAt' | 'syncedAt'>): boolean {
  return row.syncedAt == null || row.updatedAt > row.syncedAt;
}

export interface PhotoSyncPlan {
  /** Local photos whose bytes the server hasn't got: upload, then push. */
  upload: TripPhotoRow[];
  /** Rows (tombstones, or already-uploaded rows) to push as-is. */
  push: TripPhotoRow[];
  /** Remote winners to write locally. */
  apply: RemotePhoto[];
}

export function planPhotoSync(local: TripPhotoRow[], remote: RemotePhoto[]): PhotoSyncPlan {
  const remoteById = new Map(remote.map((r) => [r.photoId, r]));
  const localIds = new Set(local.map((r) => r.id));
  const plan: PhotoSyncPlan = { upload: [], push: [], apply: [] };

  const outbound = (row: TripPhotoRow) => {
    if (row.deletedAt || row.storageId) plan.push.push(row);
    else plan.upload.push(row);
  };

  for (const row of local) {
    const counterpart = remoteById.get(row.id);
    if (!counterpart) {
      if (isPhotoDirty(row)) outbound(row);
    } else if (counterpart.updatedAt > row.updatedAt) {
      plan.apply.push(counterpart);
    } else if (row.updatedAt > counterpart.updatedAt && isPhotoDirty(row)) {
      outbound(row);
    }
    // Equal updatedAt: in sync.
  }
  for (const row of remote) {
    // A tombstone for a photo this device never had has nothing to delete.
    if (!localIds.has(row.photoId) && !row.deletedAt) plan.apply.push(row);
  }
  return plan;
}
