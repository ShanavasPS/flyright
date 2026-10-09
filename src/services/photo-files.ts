import { File, Paths } from 'expo-file-system';
import { fetch } from 'expo/fetch';

import { MAX_PHOTO_BYTES } from '../../convex/uploadShared';
import { convertToJpeg, photoFormat } from '@/services/photo-normalize';

/** iOS can move the app's data container during an update. Keep the photo's
 * filename, but resolve our trip-photos directory against this installation.
 * Remote URLs and files outside that directory must never be rebased. */
export function resolvePhotoUri(uri: string): string {
  const name = uri.startsWith('file:///')
    ? /\/trip-photos\/([a-zA-Z0-9_-]+\.jpg)$/.exec(uri)?.[1]
    : undefined;
  return name ? new File(Paths.document, 'trip-photos', name).uri : uri;
}

/** Why a photo did not reach the server, for the strip to say so. Before
 * 1.2.3 every failure read "they upload when you're back online", even a
 * photo the server would never accept, and Retry sent it again forever. */
export type PhotoUploadFailure = 'offline' | 'limit' | 'storage' | 'rejected' | 'missing';

export class PhotoUploadError extends Error {
  constructor(message: string, public readonly kind: PhotoUploadFailure) {
    super(message);
  }
}

/** The failure kind of anything an upload attempt threw. Server refusals
 * from generateUploadUrl arrive as ConvexErrors carrying their message. */
export function uploadFailureKind(error: unknown): PhotoUploadFailure {
  if (error instanceof PhotoUploadError) return error.kind;
  const data = (error as { data?: unknown } | null)?.data;
  const text = `${typeof data === 'string' ? data : ''} ${error instanceof Error ? error.message : ''}`;
  if (/too many requests/i.test(text)) return 'limit';
  if (/storage is full/i.test(text)) return 'storage';
  return 'offline';
}

/** The bytes to send for a stored photo, converted to a JPEG when the file
 * is anything else (an iPhone HEIC under a .jpg name, most often) or too big
 * for the server. The converted JPEG replaces the file on the phone, so the
 * row keeps pointing at a picture the server takes. */
async function preparePhotoBytes(file: File): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: 'image/jpeg' | 'image/png' }> {
  if (!file.exists || file.size <= 0) throw new PhotoUploadError('Photo file is unavailable.', 'missing');
  const bytes = await file.bytes();
  if (!bytes.length) throw new PhotoUploadError('Photo file is unavailable.', 'missing');
  const format = photoFormat(bytes);
  if (format !== 'other' && bytes.length <= MAX_PHOTO_BYTES) {
    return { bytes, type: format === 'png' ? 'image/png' : 'image/jpeg' };
  }
  let converted: Uint8Array<ArrayBuffer>;
  try {
    const jpeg = new File((await convertToJpeg(file.uri)).uri);
    converted = await jpeg.bytes();
    jpeg.delete();
  } catch {
    throw new PhotoUploadError('This photo could not be converted for upload.', 'rejected');
  }
  if (!converted.length || converted.length > MAX_PHOTO_BYTES) {
    throw new PhotoUploadError('Photo must be under 10 MB.', 'rejected');
  }
  file.write(converted);
  return { bytes: converted, type: 'image/jpeg' };
}

/** Read before starting the request. iOS's background fromFile uploader
 * raises an uncaught NSException for unreadable files; a JS catch around
 * uploadAsync cannot prevent that process-wide crash. Reading bytes and
 * sending them through fetch keeps file/network failures as rejections.
 *
 * `uploadUrl` may be a function: the upload ticket it fetches counts against
 * the daily allowance, so it is asked for only once the bytes are ready — a
 * missing or unusable file no longer spends one on every retry. */
export async function uploadPhotoFile(uri: string, uploadUrl: string | (() => Promise<string>)): Promise<string> {
  if (!uri.startsWith('file:///')) throw new PhotoUploadError('Photo is not stored on this device.', 'missing');
  const { bytes, type } = await preparePhotoBytes(new File(resolvePhotoUri(uri)));
  const url = typeof uploadUrl === 'string' ? uploadUrl : await uploadUrl();
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': type }, body: bytes });
  } catch (error) {
    throw new PhotoUploadError(error instanceof Error ? error.message : 'Network request failed', 'offline');
  }
  if (!response.ok) {
    // 4xx: the server looked at this photo and will not take it. 5xx and
    // the rest are worth another try later.
    const refused = response.status >= 400 && response.status < 500;
    throw new PhotoUploadError(`Photo upload failed (${response.status})`, refused ? 'rejected' : 'offline');
  }
  const result = await response.json() as { storageId?: unknown };
  if (typeof result.storageId !== 'string' || !result.storageId) {
    throw new PhotoUploadError('Photo upload did not return a storage ID.', 'offline');
  }
  return result.storageId;
}
