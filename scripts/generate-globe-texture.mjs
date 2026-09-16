/**
 * Rasterises Natural Earth land and country borders into the equirectangular
 * masks the World tab's globe shader samples. Every output is an RGBA PNG
 * whose ALPHA channel is the mask (land or border = opaque white, sea =
 * transparent): Skia can read an image's alpha back as an 8-bit texture,
 * which is how the app keeps the detail tiles at a quarter of the memory
 * of a colour image. The shader colours the mask from the theme at draw
 * time, so one set serves both colour schemes.
 *
 *   assets/images/globe-land.png              50m land, 2048×1024 — the
 *                                             whole-globe view, always loaded
 *   assets/images/globe-detail-{0..7}.png     10m land, 8192×4096 cut into
 *                                             eight 2048×2048 tiles (4 across,
 *                                             2 down), for zooming in
 *   assets/images/globe-borders-{0,1}.png     10m country borders, 4096×2048
 *                                             as two 2048×2048 tiles
 *
 * Re-run after bumping `world-atlas`:
 *
 *   node scripts/generate-globe-texture.mjs
 */
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { feature, mesh } from 'topojson-client';

const require = createRequire(import.meta.url);
const out = (name) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images', name);

const TILE = 2048;

/** Rings that cross the antimeridian (Russia's Chukotka shares a ring with
 * the rest of Siberia; Antarctica walks the map edge) would draw a line the
 * whole width of the map and the fill would paint a band. Instead each ring
 * is unwrapped — a jump of more than 180° carries on past the edge rather
 * than snapping back — and the whole drawing is stamped three times, a
 * world apart, so whatever ran off one edge appears on the other. */
function unwrap(ring) {
  let shift = 0;
  let prev = null;
  return ring.map(([lon, lat]) => {
    if (prev != null) {
      if (lon - prev > 180) shift -= 360;
      else if (lon - prev < -180) shift += 360;
    }
    prev = lon;
    return [lon + shift, lat];
  });
}

/** SVG path data for a list of rings/lines at a given raster size. */
function pathData(lines, width, height, close) {
  const x = (lon) => (((lon + 180) / 360) * width).toFixed(1);
  const y = (lat) => (((90 - lat) / 180) * height).toFixed(1);
  let d = '';
  for (const line of lines) {
    const points = unwrap(line);
    d += points.map(([lon, lat], i) => `${i ? 'L' : 'M'}${x(lon)} ${y(lat)}`).join('');
    if (close) d += 'Z';
  }
  return d;
}

function polygonsOf(geometry) {
  if (geometry.type === 'FeatureCollection') return geometry.features.flatMap((f) => polygonsOf(f.geometry));
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function svg(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

/** Three stamps of the same drawing, a world apart, so unwrapped rings
 * that ran past one edge show up at the other. */
function stamped(inner, width) {
  return (
    `<g transform="translate(${-width} 0)">${inner}</g>` +
    inner +
    `<g transform="translate(${width} 0)">${inner}</g>`
  );
}

async function renderLand(topo, width, height) {
  const land = feature(topo, topo.objects.land);
  const rings = polygonsOf(land).flatMap((polygon) => polygon);
  const d = pathData(rings, width, height, true);
  const inner = `<path d="${d}" fill="#fff" fill-rule="evenodd"/>`;
  return sharp(Buffer.from(svg(width, height, stamped(inner, width))), { limitInputPixels: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function renderBorders(topo, width, height, strokeWidth) {
  const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b);
  const d = pathData(borders.coordinates, width, height, false);
  const inner = `<path d="${d}" fill="none" stroke="#fff" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`;
  return sharp(Buffer.from(svg(width, height, stamped(inner, width))), { limitInputPixels: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

/** Write a raster as PNG, whole or cut into TILE×TILE pieces. */
async function write(raster, name, tiles) {
  const { data, info } = raster;
  const base = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 }, limitInputPixels: false });
  if (!tiles) {
    await base.png({ compressionLevel: 9 }).toFile(out(name));
    return [name];
  }
  const names = [];
  const across = info.width / TILE;
  const down = info.height / TILE;
  let i = 0;
  for (let ty = 0; ty < down; ty += 1) {
    for (let tx = 0; tx < across; tx += 1) {
      const file = name.replace('#', String(i));
      await base
        .clone()
        .extract({ left: tx * TILE, top: ty * TILE, width: TILE, height: TILE })
        .png({ compressionLevel: 9 })
        .toFile(out(file));
      names.push(file);
      i += 1;
    }
  }
  return names;
}

const report = (names) =>
  names
    .map((n) => `${n} (${(fs.statSync(out(n)).size / 1024).toFixed(0)} KB)`)
    .join('\n  ');

const land50 = require('world-atlas/land-50m.json');
console.log('  ' + report(await write(await renderLand(land50, 2048, 1024), 'globe-land.png', false)));

const land10 = require('world-atlas/land-10m.json');
console.log('  ' + report(await write(await renderLand(land10, 8192, 4096), 'globe-detail-#.png', true)));

const countries10 = require('world-atlas/countries-10m.json');
console.log('  ' + report(await write(await renderBorders(countries10, 4096, 2048, 2), 'globe-borders-#.png', true)));
