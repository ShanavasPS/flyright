/** Trip photos: the local `trip_photos` table plus the file each row points
 * at. Imports copy the picked image into the app's document directory (the
 * picker's cache URI is temporary), so a row's uri is either that file:// path
 * or, for photos that arrived through sync, its Convex storage URL. */

import { and, asc, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Directory, File, Paths, UploadType } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { db } from '@/db/client';
import { tripPhotos } from '@/db/schema';
import type { RemotePhoto, TripPhotoRow } from '@/services/photo-sync-plan';

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

/** A trip's photos, oldest first. Live. */
export function usePhotos(journeyId: string): TripPhotoRow[] {
  const { data } = useLiveQuery(
    db
      .select()
      .from(tripPhotos)
      .where(and(eq(tripPhotos.journeyId, journeyId), isNull(tripPhotos.deletedAt)))
      .orderBy(asc(tripPhotos.createdAt)),
    [journeyId],
  );
  return data ?? [];
}

export function usePhoto(id: string): TripPhotoRow | undefined {
  const { data } = useLiveQuery(db.select().from(tripPhotos).where(eq(tripPhotos.id, id)), [id]);
  return data?.[0];
}

/** System camera or library UI. Resolves to [] when the traveler cancels. */
export async function pickImages(source: 'camera' | 'library'): Promise<PickedImage[]> {
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
      allowsMultipleSelection: true,
      selectionLimit: 10,
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

/** Copies each picked image into the document directory and records a row
 * for it. The row is dirty (syncedAt null) so the sync uploads it. */
export async function importPhotos(
  journeyId: string,
  userId: string | null | undefined,
  picked: PickedImage[],
): Promise<void> {
  if (!picked.length) return;
  const dir = photoDir();
  if (!dir.exists) dir.create({ intermediates: true });
  for (const image of picked) {
    const id = newPhotoId();
    const target = new File(dir, `${id}.jpg`);
    await new File(image.uri).copy(target);
    const now = new Date().toISOString();
    await db.insert(tripPhotos).values({
      id,
      journeyId,
      userId: userId ?? null,
      uri: target.uri,
      width: image.width,
      height: image.height,
      storageId: null,
      createdAt: now,
      updatedAt: now,
    });
  }
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
    const file = new File(uri);
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
export async function uploadPhoto(row: TripPhotoRow, uploadUrl: string): Promise<string> {
  const file = new File(row.uri);
  const task = file.createUploadTask(uploadUrl, {
    httpMethod: 'POST',
    uploadType: UploadType.BINARY_CONTENT,
    mimeType: 'image/jpeg',
    headers: { 'Content-Type': 'image/jpeg' },
  });
  const result = await task.uploadAsync();
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Photo upload failed (${result.status})`);
  }
  const { storageId } = JSON.parse(result.body) as { storageId: string };
  return storageId;
}

/** Records the upload without touching updatedAt, so the row's push carries
 * the same stamp and the tie afterwards reads as "in sync". */
export async function markPhotoUploaded(id: string, storageId: string): Promise<void> {
  await db.update(tripPhotos).set({ storageId }).where(eq(tripPhotos.id, id));
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
  const uri = existing?.uri.startsWith('file://') ? existing.uri : remote.url;
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
