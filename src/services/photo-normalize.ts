/** Trip photos travel as JPEGs no larger than MAX_PHOTO_EDGE on the long
 * side. The picker does not guarantee that: on iOS, expo-image-picker hands a
 * library pick over in its original HEIC even when a quality below 1 is
 * asked for, and a 48 MP camera photo stays 48 MP. Both were refused by the
 * server (JPEG or PNG, at most 40 MP and 10 MB), and the photo sat on the
 * phone for good. Converting here keeps every photo uploadable and small
 * enough to load quickly in a follower's feed. */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** The long edge a stored trip photo is scaled down to. 4096 × 3072 is
 * 12.6 MP: sharp on any phone or tablet, about 2–4 MB as a JPEG. */
export const MAX_PHOTO_EDGE = 4096;
const JPEG_QUALITY = 0.8;

/** The size a width × height picture should be scaled to so its long edge is
 * at most `max`, keeping its shape; null when it already fits. */
export function fitWithin(width: number, height: number, max = MAX_PHOTO_EDGE): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  const long = Math.max(width, height);
  if (long <= max) return null;
  const scale = max / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type PhotoFormat = 'jpeg' | 'png' | 'other';

/** The format the bytes are actually in, whatever the file is called. */
export function photoFormat(bytes: Uint8Array): PhotoFormat {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return 'png';
  return 'other';
}

/** Re-encodes the image at `uri` (HEIC, PNG, an oversized JPEG…) as a JPEG
 * that fits within MAX_PHOTO_EDGE. Returns a new file in the cache; the
 * caller moves it where it belongs. */
export async function convertToJpeg(uri: string): Promise<{ uri: string; width: number; height: number }> {
  const context = ImageManipulator.manipulate(uri);
  let image = await context.renderAsync();
  const target = fitWithin(image.width, image.height);
  if (target) {
    image.release();
    context.resize(target);
    image = await context.renderAsync();
  }
  try {
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    return { uri: saved.uri, width: saved.width, height: saved.height };
  } finally {
    image.release();
    context.release();
  }
}
