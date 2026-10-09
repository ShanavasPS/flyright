/** Trip photos: the local `trip_photos` table plus the file each row points
 * at. Imports write the picked image into the app's document directory as a
 * JPEG of at most MAX_PHOTO_EDGE (the picker's cache URI is temporary, and
 * its file may be a HEIC — see photo-normalize), so a row's uri is either
 * that file:// path or, for photos that arrived through sync, its Convex
 * storage URL. */

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { db } from '@/db/client';
import { tripPhotos } from '@/db/schema';
import { useLiveRow, useLiveRows } from '@/services/live-rows';
import type { RemotePhoto, TripPhotoRow } from '@/services/photo-sync-plan';
import { resolvePhotoUri, uploadPhotoFile } from '@/services/photo-files';
import { convertToJpeg } from '@/services/photo-normalize';

export type { TripPhotoRow };

export interface PickedImage {
  uri: string;
  width: number | null;
  height: number | null;
}

/** Thrown when the traveler declined the camera or library permission. */
export class PhotoPermissionError extends Error {
  constructor(public readonly source: 'camera' | 'library') {
    super(source === 'camera' ? 'Camera access was declined' : 'Photo library access was declined');
  }
}

const photoDir = () => new Directory(Paths.document, 'trip-photos');

function newPhotoId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A trip's photos, oldest first. Live; undefined until the first read. */
export function usePhotos(journeyId: string): TripPhotoRow[] | undefined {
  const { data } = useLiveRows(
    db
      .select()
      .from(tripPhotos)
      .where(and(eq(tripPhotos.journeyId, journeyId), isNull(tripPhotos.deletedAt)))
      .orderBy(asc(tripPhotos.createdAt)),
    [journeyId],
  );
  return data?.map(withCurrentPhotoUri);
}

/** Every photo of several flights (one trip), oldest first. */
export function useTripPhotos(journeyIds: string[]): TripPhotoRow[] | undefined {
  const { data } = useLiveRows(
    db
      .select()
      .from(tripPhotos)
      .where(and(inArray(tripPhotos.journeyId, journeyIds), isNull(tripPhotos.deletedAt)))
      .orderBy(asc(tripPhotos.createdAt)),
    [journeyIds.join(',')],
  );
  return data?.map(withCurrentPhotoUri);
}

/** One photo by id; `loaded` separates "still reading" from "gone". */
export function usePhoto(id: string) {
  const result = useLiveRow(db.select().from(tripPhotos).where(eq(tripPhotos.id, id)), [id]);
  return { ...result, row: result.row ? withCurrentPhotoUri(result.row) : undefined };
}

function withCurrentPhotoUri(row: TripPhotoRow): TripPhotoRow {
  return { ...row, uri: resolvePhotoUri(row.uri) };
}

/** System camera or library UI. Resolves to [] when the traveler cancels.
 * `limit` caps a library pick; 1 makes it a single choice. */
export async function pickImages(
  source: 'camera' | 'library',
  { limit = 10 }: { limit?: number } = {},
): Promise<PickedImage[]> {
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new PhotoPermissionError('camera');
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  } else {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new PhotoPermissionError('library');
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: limit > 1,
      selectionLimit: limit,
      quality: 0.8,
    });
  }
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    uri: asset.uri,
    width: asset.width || null,
    height: asset.height || null,
  }));
}

/** What an import did with each picked image: the photo it is now (a new
 * row, or the trip's existing copy of the very same picture) and how many
 * of them were already there. */
export interface ImportResult {
  ids: string[];
  reused: number;
}

/** SHA-256 of a file's bytes, hex; null when it can't be read. The picker
 * re-encodes a picture the same way each time, so the same photo picked
 * twice hashes the same. */
async function contentHashOf(file: File): Promise<string | null> {
  try {
    const hash = await digest(CryptoDigestAlgorithm.SHA256, await file.bytes());
    return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** The trip's photos by content hash. Older local photos get theirs worked
 * out (and kept) now; ones that only exist on the server are left to the
 * server's own check. */
async function hashesOf(journeyId: string): Promise<Map<string, string>> {
  const rows = await db
    .select()
    .from(tripPhotos)
    .where(and(eq(tripPhotos.journeyId, journeyId), isNull(tripPhotos.deletedAt)));
  const byHash = new Map<string, string>();
  for (const row of rows) {
    let hash = row.contentHash;
    if (!hash && row.uri.startsWith('file://')) {
      const file = new File(resolvePhotoUri(row.uri));
      if (file.exists) {
        hash = await contentHashOf(file);
        // Local bookkeeping only: updatedAt stays, so nothing re-syncs.
        if (hash) await db.update(tripPhotos).set({ contentHash: hash }).where(eq(tripPhotos.id, row.id));
      }
    }
    if (hash && !byHash.has(hash)) byHash.set(hash, row.id);
  }
  return byHash;
}

/** Copies each picked image into the document directory and records a row
 * for it. The row is dirty (syncedAt null) so the sync uploads it. A picture
 * the trip already has is not added again — offline, when nothing seems to
 * upload, it is easy to pick the same photo a dozen times (QR516, Sep 19):
 * its existing photo stands in. Resolves to the photos' ids, in the order
 * picked. */
export async function importPhotos(
  journeyId: string,
  userId: string | null | undefined,
  picked: PickedImage[],
): Promise<ImportResult> {
  const result: ImportResult = { ids: [], reused: 0 };
  if (!picked.length) return result;
  const dir = photoDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const known = await hashesOf(journeyId);
  for (const image of picked) {
    const source = new File(image.uri);
    const hash = await contentHashOf(source);
    const existing = hash ? known.get(hash) : undefined;
    if (existing) {
      result.ids.push(existing);
      result.reused += 1;
      continue;
    }
    const id = newPhotoId();
    result.ids.push(id);
    const target = new File(dir, `${id}.jpg`);
    let size = { width: image.width, height: image.height };
    try {
      const jpeg = await convertToJpeg(image.uri);
      await new File(jpeg.uri).move(target);
      size = { width: jpeg.width, height: jpeg.height };
    } catch {
      // Keep the original rather than lose the photo; the upload converts
      // it then (photo-files), or says why it cannot.
      await source.copy(target);
    }
    const now = new Date().toISOString();
    await db.insert(tripPhotos).values({
      id,
      journeyId,
      userId: userId ?? null,
      uri: target.uri,
      width: size.width,
      height: size.height,
      storageId: null,
      contentHash: hash,
      createdAt: now,
      updatedAt: now,
    });
    if (hash) known.set(hash, id);
  }
  return result;
}

/** One photo row by id, read once. */
export async function photoById(id: string): Promise<TripPhotoRow | undefined> {
  const [row] = await db.select().from(tripPhotos).where(eq(tripPhotos.id, id));
  return row ? withCurrentPhotoUri(row) : undefined;
}

/** Soft delete: the row stays as a tombstone so the sync removes the stored
 * file on the server; the local bytes go now. */
export async function deletePhoto(id: string): Promise<void> {
  const [row] = await db.select().from(tripPhotos).where(eq(tripPhotos.id, id));
  const now = new Date().toISOString();
  await db
    .update(tripPhotos)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(tripPhotos.id, id));
  removeLocalFile(row?.uri);
}

function removeLocalFile(uri: string | undefined) {
  if (!uri?.startsWith('file://')) return;
  try {
    const file = new File(resolvePhotoUri(uri));
    if (file.exists) file.delete();
  } catch {
    // Best effort — a stranded file is harmless.
  }
}

// ---------------------------------------------------------------------------
// Sync plumbing (see components/photo-sync.tsx). The pure planning lives in
// photo-sync-plan.ts so it can be tested without the native modules above.

export {
  isPhotoDirty,
  planPhotoSync,
  toRemotePhoto,
  type PhotoSyncPlan,
  type RemotePhoto,
} from '@/services/photo-sync-plan';

/** POSTs the file's bytes to a Convex upload URL and returns the storageId. */
export async function uploadPhoto(row: TripPhotoRow, uploadUrl: string | (() => Promise<string>)): Promise<string> {
  return uploadPhotoFile(row.uri, uploadUrl);
}

/** Records the upload without touching updatedAt, so the row's push carries
 * the same stamp and the tie afterwards reads as "in sync". */
export async function markPhotoUploaded(id: string, storageId: string, updatedAt?: string): Promise<void> {
  await db.update(tripPhotos).set({ storageId, ...(updatedAt ? { updatedAt } : {}) }).where(eq(tripPhotos.id, id));
}

/** Forget the stored file of photos the server would not accept (see
 * convex/photos.push), so the sync uploads them again. */
export async function clearPhotoUploads(ids: string[]): Promise<void> {
  for (const id of ids) {
    await db.update(tripPhotos).set({ storageId: null }).where(eq(tripPhotos.id, id));
  }
}

export async function markPhotosSynced(rows: { id: string; updatedAt: string }[]): Promise<void> {
  for (const { id, updatedAt } of rows) {
    await db
      .update(tripPhotos)
      .set({ syncedAt: updatedAt })
      .where(and(eq(tripPhotos.id, id), eq(tripPhotos.updatedAt, updatedAt)));
  }
}

/** Writes a remote winner locally. A photo this device already holds keeps
 * its file:// uri; one it has never seen points at the storage URL. */
export async function applyRemotePhoto(remote: RemotePhoto, userId: string): Promise<void> {
  const [existing] = await db.select().from(tripPhotos).where(eq(tripPhotos.id, remote.photoId));
  if (remote.deletedAt) {
    if (!existing) return;
    await db
      .update(tripPhotos)
      .set({ deletedAt: remote.deletedAt, updatedAt: remote.updatedAt, syncedAt: remote.updatedAt })
      .where(eq(tripPhotos.id, remote.photoId));
    removeLocalFile(existing.uri);
    return;
  }
  const localUri = existing?.uri.startsWith('file://') ? resolvePhotoUri(existing.uri) : null;
  const uri = localUri && new File(localUri).exists ? localUri : remote.url;
  if (!uri) return; // nothing to show yet — the server has no file for it
  const columns = {
    journeyId: remote.journeyKey,
    userId,
    uri,
    width: remote.width,
    height: remote.height,
    storageId: remote.storageId,
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
    deletedAt: null,
    syncedAt: remote.updatedAt,
  };
  await db
    .insert(tripPhotos)
    .values({ id: remote.photoId, ...columns })
    .onConflictDoUpdate({ target: tripPhotos.id, set: columns });
}
