/**
 * Builds the World share poster's two backdrops from the same NASA imagery
 * as the globe (generate-globe-day.mjs, generate-globe-lights.mjs), at twice
 * the globe's resolution: a poster crops a region of the world and is saved
 * at 1080 px wide, so the globe's 2048 px world would go soft.
 *
 *   assets/images/poster-day.jpg     4096×2048 Blue Marble — the Day poster
 *   assets/images/poster-night.jpg   4096×2048 Blue Marble dimmed to a deep
 *                                    night blue with the Black Marble's city
 *                                    lights baked in, gold — the Night poster
 *
 * Both are full equirectangular images (lat 90 → −90), so the card places
 * them in the atlas's viewBox by latitude (services/geo project) and the SVG
 * crops them.
 *
 *   node scripts/generate-poster-textures.mjs
 */

import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { fetchBlueMarble } from './generate-globe-day.mjs';
import { buildLightsMask } from './generate-globe-lights.mjs';

const WIDTH = 4096;
const HEIGHT = 2048;
const QUALITY = 78;
/** How much of the Blue Marble's own colour survives on the night side,
 * and the navy it sinks toward (the dark poster's land, lifted a touch so
 * the continents still read). */
const NIGHT_KEEP = 0.26;
const NIGHT_NAVY = [0x12, 0x1f, 0x3a];
/** Sodium-lamp gold, as on the globe. */
const CITY = [255, 204, 128];

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');

async function main() {
  const source = await fetchBlueMarble();
  const day = await sharp(source, { limitInputPixels: false })
    .resize(WIDTH, HEIGHT, { kernel: 'lanczos3', fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  await sharp(day.data, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toFile(path.join(assets, 'poster-day.jpg'));

  const lights = await buildLightsMask(WIDTH, HEIGHT);
  const night = Buffer.alloc(WIDTH * HEIGHT * 3);
  for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
    const l = lights.rgba[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c += 1) {
      const base = day.data[i * 3 + c] * NIGHT_KEEP + NIGHT_NAVY[c] * (1 - NIGHT_KEEP);
      // Lights add on top (screen-like), never past white.
      night[i * 3 + c] = Math.min(255, Math.round(base + CITY[c] * l * 0.95));
    }
  }
  await sharp(night, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toFile(path.join(assets, 'poster-night.jpg'));

  for (const name of ['poster-day.jpg', 'poster-night.jpg']) {
    const size = fs.statSync(path.join(assets, name)).size;
    console.log(`wrote assets/images/${name}: ${WIDTH}×${HEIGHT}, ${(size / 1024).toFixed(0)} KB`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
