export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_PIXELS = 40_000_000;

/** Accept raster formats only; never serve HTML or SVG as a journal image. */
export function imageType(bytes: Uint8Array): string | null {
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
