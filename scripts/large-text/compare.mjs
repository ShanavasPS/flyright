/** Pixel comparisons for the large-text run, with sharp (no new dependency).
 * The status bar and the home indicator / navigation bar are masked, and a
 * pixel counts as changed only past a small anti-aliasing tolerance. */
import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const TOP = 0.07;
const BOTTOM = 0.05;
const TOLERANCE = 48;
/** Share of pixels allowed to differ before a pair counts as changed. */
export const THRESHOLD = 0.001;

async function raw(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Share of changed pixels between two PNGs (1 when their sizes differ);
 * writes a red-marked copy of `b` to `diffFile` when anything changed. */
export async function diffImages(a, b, diffFile) {
  const [left, right] = await Promise.all([raw(a), raw(b)]);
  if (left.width !== right.width || left.height !== right.height) return 1;
  const { width, height } = left;
  const top = Math.round(height * TOP);
  const bottom = Math.round(height * (1 - BOTTOM));
  const marked = Buffer.from(right.data);
  let changed = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const delta =
        Math.abs(left.data[i] - right.data[i]) +
        Math.abs(left.data[i + 1] - right.data[i + 1]) +
        Math.abs(left.data[i + 2] - right.data[i + 2]);
      if (delta > TOLERANCE) {
        changed++;
        marked[i] = 255;
        marked[i + 1] = 0;
        marked[i + 2] = 0;
      }
    }
  }
  const share = changed / (width * (bottom - top));
  if (share > 0 && diffFile) {
    await sharp(marked, { raw: { width, height, channels: 4 } }).png().toFile(diffFile);
  }
  return share;
}

/** Every `normal` shot of this run against the same file in a baseline run. */
export async function compareDrift(out, baseline) {
  const results = [];
  for (const platform of ['ios', 'android']) {
    for (const pass of ['B0', 'B', 'B2', 'A', 'C']) {
      const dir = join(out, platform, pass);
      if (!existsSync(dir)) continue;
      mkdirSync(join(dir, '_diff'), { recursive: true });
      for (const file of readdirSync(dir).filter((name) => name.endsWith('__normal.png'))) {
        const before = join(baseline, platform, pass, file);
        if (!existsSync(before)) continue;
        const share = await diffImages(before, join(dir, file), join(dir, '_diff', file));
        results.push({ platform, pass, file, share, changed: share > THRESHOLD });
      }
    }
  }
  return results;
}

/** The engages shots (size1..size3, all above the cap) must match each other. */
export async function compareEngages(out, names) {
  const results = [];
  for (const platform of ['ios', 'android']) {
    const dir = join(out, platform, 'engages');
    if (!existsSync(dir)) continue;
    for (const name of names) {
      const files = [1, 2, 3].map((n) => join(dir, `${name}__size${n}.png`));
      if (!files.every((file) => existsSync(file))) {
        results.push({ platform, name, complete: false });
        continue;
      }
      const shares = [
        await diffImages(files[0], files[1], join(dir, `${name}__diff12.png`)),
        await diffImages(files[1], files[2], join(dir, `${name}__diff23.png`)),
      ];
      results.push({ platform, name, complete: true, shares, holds: shares.every((share) => share <= THRESHOLD) });
    }
  }
  return results;
}
