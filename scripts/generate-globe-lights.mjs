/**
 * Builds the globe's city-lights mask from NASA's Black Marble — the Earth
 * at night as the Suomi NPP satellite saw it in 2016, the same picture the
 * seat-back map shows. The output follows the land masks' convention (see
 * generate-globe-texture.mjs): an RGBA PNG whose ALPHA is the mask, here
 * how brightly a place is lit, so the shader colours the lights at draw
 * time and can read the image back as an 8-bit texture.
 *
 *   assets/images/globe-lights.png   2048×1024, equirectangular, matching
 *                                    the base land mask pixel for pixel
 *
 * The 3 km source (13500×6750, 8 MB) is fetched once into the OS temp
 * folder. NASA imagery is public domain; credit "NASA Earth Observatory
 * (Joshua Stevens), Suomi NPP VIIRS data (Miguel Román, NASA GSFC)".
 *
 *   node scripts/generate-globe-lights.mjs
 */

import { Buffer } from 'node:buffer';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const SOURCE = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg';
const WIDTH = 2048;
const HEIGHT = 1024;
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images', 'globe-lights.png');

/** The source also shows moonlit terrain — snow, ice and desert come out
 * grey. Lights are small and sharp against it, so a high-pass takes the
 * terrain out: a wide blur of the image, mostly subtracted. BLUR is the
 * sigma in output pixels (≈20 px ≈ 350 km at the equator), KEEP how much of
 * the blurred image to leave in, so a region-wide glow (the Nile delta, the
 * Low Countries) is not flattened entirely. */
const BLUR = 20;
const KEEP = 0.15;
/** What is left below this (of 255) is noise, sea glints and the halo the
 * high-pass leaves along the edge of an ice sheet: off. */
const FLOOR = 10;
/** Nothing is lit south of here but research stations; the Antarctic ice
 * edge would otherwise glow. */
const SOUTH_CUT_LAT = -62;
/** Everything above this is as bright as it gets — the biggest cities
 * saturate in the source anyway, and lifting the mid-tones is what makes
 * the smaller towns and the roads between them show at globe size. */
const CEILING = 120;
/** Mid-tone lift (a gamma below 1 brightens). */
const GAMMA = 0.75;

export async function fetchBlackMarble() {
  const cached = path.join(os.tmpdir(), 'BlackMarble_2016_3km.jpg');
  if (fs.existsSync(cached) && fs.statSync(cached).size > 1_000_000) return cached;
  console.log('fetching Black Marble (8 MB)…');
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  fs.writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
  return cached;
}

/** The lights mask at the given size: an RGBA buffer, white with the lights
 * in the alpha. Shared with generate-poster-textures.mjs. */
export async function buildLightsMask(width, height) {
  const source = await fetchBlackMarble();
  // Downsample so every town contributes to its pixel rather than being
  // skipped, then take the luminance.
  const { data, info } = await sharp(source, { limitInputPixels: false })
    .resize(width, height, { kernel: 'lanczos3', fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // sharp hands the blur back with its own channel count (three, for a
  // one-channel input), so index it by that.
  // The blur sigma scales with the output so the high-pass removes the same
  // ground features at every size.
  const blur = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .blur(BLUR * (width / WIDTH))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  let lit = 0;
  const southCut = Math.round(((90 - SOUTH_CUT_LAT) / 180) * info.height);
  for (let i = 0; i < info.width * info.height; i += 1) {
    const row = Math.floor(i / info.width);
    const v = row >= southCut ? 0 : data[i * info.channels] - (1 - KEEP) * blur.data[i * blur.info.channels];
    const t = Math.min(1, Math.max(0, (v - FLOOR) / (CEILING - FLOOR)));
    const a = Math.round(255 * Math.pow(t, GAMMA));
    if (a > 0) lit += 1;
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = a;
  }
  return { rgba, width: info.width, height: info.height, lit: lit / (info.width * info.height) };
}

async function main() {
  const mask = await buildLightsMask(WIDTH, HEIGHT);
  await sharp(mask.rgba, { raw: { width: mask.width, height: mask.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(out);
  const size = fs.statSync(out).size;
  console.log(`wrote ${path.relative(process.cwd(), out)}: ${mask.width}×${mask.height}, ${(mask.lit * 100).toFixed(1)}% lit, ${(size / 1024).toFixed(0)} KB`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
