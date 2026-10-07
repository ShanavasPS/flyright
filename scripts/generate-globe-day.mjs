/**
 * Builds the globe's daytime imagery from NASA's Blue Marble Next
 * Generation — the cloud-free Earth with topography and bathymetry, July
 * 2004 — the daytime twin of the Black Marble the night side shows (see
 * generate-globe-lights.mjs). Unlike the land masks this is a colour image
 * the shader samples directly, so it is kept as a JPEG:
 *
 *   assets/images/globe-day.jpg   2048×1024, equirectangular, matching the
 *                                 base land mask pixel for pixel
 *
 * The 5400×2700 source (2.3 MB) is fetched once into the OS temp folder.
 * NASA imagery is public domain; credit "NASA Earth Observatory (Reto
 * Stöckli), Blue Marble Next Generation".
 *
 *   node scripts/generate-globe-day.mjs
 */

import { Buffer } from 'node:buffer';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const SOURCE = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x5400x2700.jpg';
const WIDTH = 2048;
const HEIGHT = 1024;
/** JPEG quality: the globe is never shown at more than ~2 px per texel,
 * and the sea's smooth gradients are where artefacts would show first. */
const QUALITY = 84;
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images', 'globe-day.jpg');

export async function fetchBlueMarble() {
  const cached = path.join(os.tmpdir(), 'BlueMarble_200407_topo_bathy_5400.jpg');
  if (fs.existsSync(cached) && fs.statSync(cached).size > 1_000_000) return cached;
  console.log('fetching Blue Marble (2.3 MB)…');
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  fs.writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
  return cached;
}

async function main() {
  const source = await fetchBlueMarble();
  await sharp(source, { limitInputPixels: false })
    .resize(WIDTH, HEIGHT, { kernel: 'lanczos3', fit: 'fill' })
    .jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toFile(out);
  const size = fs.statSync(out).size;
  console.log(`wrote ${path.relative(process.cwd(), out)}: ${WIDTH}×${HEIGHT}, ${(size / 1024).toFixed(0)} KB`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
