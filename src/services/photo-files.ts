import { File, Paths } from 'expo-file-system';
import { fetch } from 'expo/fetch';

import { MAX_PHOTO_BYTES } from '../../convex/uploadShared';

/** iOS can move the app's data container during an update. Keep the photo's
 * filename, but resolve our trip-photos directory against this installation.
 * Remote URLs and files outside that directory must never be rebased. */
export function resolvePhotoUri(uri: string): string {
  const name = uri.startsWith('file:///')
    ? /\/trip-photos\/([a-zA-Z0-9_-]+\.jpg)$/.exec(uri)?.[1]
    : undefined;
  return name ? new File(Paths.document, 'trip-photos', name).uri : uri;
}

/** Read before starting the request. iOS's background fromFile uploader
 * raises an uncaught NSException for unreadable files; a JS catch around
 * uploadAsync cannot prevent that process-wide crash. Reading bytes and
 * sending them through fetch keeps file/network failures as rejections. */
export async function uploadPhotoFile(uri: string, uploadUrl: string): Promise<string> {
  if (!uri.startsWith('file:///')) throw new Error('Photo is not stored on this device.');
  const file = new File(resolvePhotoUri(uri));
  if (!file.exists || file.size <= 0) throw new Error('Photo file is unavailable.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Photo must be under 10 MB.');
  const bytes = await file.bytes();
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw new Error('Photo must be under 10 MB.');
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: bytes,
  });
  if (!response.ok) throw new Error(`Photo upload failed (${response.status})`);
  const result = await response.json() as { storageId?: unknown };
  if (typeof result.storageId !== 'string' || !result.storageId) {
    throw new Error('Photo upload did not return a storage ID.');
  }
  return result.storageId;
}
