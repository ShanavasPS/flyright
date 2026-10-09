export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_PIXELS = 40_000_000;
/** The import screen's own cap on a shared document (document-imports.ts). */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

/** A kept booking document: a PDF, or a picture of a pass. Never HTML or
 * SVG — the file is served back from our storage domain. */
export function documentType(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && [37, 80, 68, 70, 45].every((b, i) => bytes[i] === b)) return 'application/pdf';
  return imageType(bytes);
}

/** HEIF brands an iPhone (or an Android camera) writes for a still photo. */
const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

const fourcc = (bytes: Uint8Array, at: number) =>
  String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

/** A HEIC/HEIF still, and its largest declared image size, or null when the
 * bytes are not one. iPhones save photos as HEIC, and expo-image-picker hands
 * a library pick over unconverted, so 1.2.2 and earlier upload these bytes
 * under a .jpg name; refusing them stranded every library photo on the phone
 * behind "they upload when you're back online".
 *
 * The size comes from the `ispe` (image spatial extents) properties inside
 * the top-level `meta` box: a tiled iPhone photo declares one per 512 px
 * tile and one for the whole picture, so the largest is the photo. Only the
 * meta box is searched, never the pixel data, where the same four letters
 * can occur by chance. */
export function heifSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 16 || fourcc(bytes, 4) !== 'ftyp') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ftypSize = view.getUint32(0);
  if (ftypSize < 16 || ftypSize > bytes.length) return null;
  let heif = HEIF_BRANDS.has(fourcc(bytes, 8));
  for (let at = 16; !heif && at + 4 <= ftypSize; at += 4) heif = HEIF_BRANDS.has(fourcc(bytes, at));
  if (!heif) return null;

  // Walk the top-level boxes to the meta box.
  let offset = 0;
  let meta: [number, number] | null = null;
  while (offset + 8 <= bytes.length) {
    let size = view.getUint32(offset);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > bytes.length) return null;
      const high = view.getUint32(offset + 8);
      if (high !== 0) return null; // over 4 GB: not a photo we take
      size = view.getUint32(offset + 12);
      header = 16;
    } else if (size === 0) {
      size = bytes.length - offset;
    }
    if (size < header || offset + size > bytes.length) return null;
    if (fourcc(bytes, offset + 4) === 'meta') { meta = [offset + header, offset + size]; break; }
    offset += size;
  }
  if (!meta) return null;

  let best: { width: number; height: number } | null = null;
  for (let at = meta[0] + 4; at + 16 <= meta[1]; at++) {
    if (bytes[at] !== 0x69 || fourcc(bytes, at) !== 'ispe') continue; // 'i'
    const boxSize = view.getUint32(at - 4);
    if (boxSize !== 20) continue;
    const width = view.getUint32(at + 8), height = view.getUint32(at + 12);
    if (width > 0 && height > 0 && (!best || width * height > best.width * best.height)) best = { width, height };
  }
  return best;
}

/** Accept raster formats only; never serve HTML or SVG as a journal image. */
export function imageType(bytes: Uint8Array): string | null {
  const heif = heifSize(bytes);
  if (heif) return heif.width * heif.height <= MAX_PHOTO_PIXELS ? 'image/heic' : null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 33 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) {
    const width = view.getUint32(16), height = view.getUint32(20);
    return width > 0 && height > 0 && width * height <= MAX_PHOTO_PIXELS ? 'image/png' : null;
  }
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[bytes.length-2] === 255 && bytes[bytes.length-1] === 217) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) return null;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 218 || offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) return null;
      if ([192,193,194].includes(marker) && length >= 8) {
        const height = view.getUint16(offset+3), width = view.getUint16(offset+5);
        return width > 0 && height > 0 && width * height <= MAX_PHOTO_PIXELS ? 'image/jpeg' : null;
      }
      offset += length;
    }
  }
  return null;
}

export async function boundedBody(request: Request, maximum: number): Promise<Uint8Array<ArrayBuffer>> {
  const announced = request.headers.get('content-length');
  if (announced && (!/^\d+$/.test(announced) || Number(announced) > maximum)) throw new Error('Body too large');
  if (!request.body) throw new Error('Missing body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new Error('Body too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
