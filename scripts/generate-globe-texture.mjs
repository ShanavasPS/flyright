/**
 * Rasterises Natural Earth's 50m land polygons into the equirectangular
 * land mask the World tab's globe shader samples (assets/images/globe-land.png).
 *
 * White = land, black = sea, 2048×1024 (one pixel ≈ 0.18°). The shader
 * colours it from the theme at draw time, so one texture serves both
 * colour schemes. Re-run after bumping `world-atlas`:
 *
 *   node scripts/generate-globe-texture.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import sharp from 'sharp';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const topo = require('world-atlas/land-50m.json');
const land = feature(topo, topo.objects.land);

const WIDTH = 2048;
const HEIGHT = 1024;
const x = (lon) => (((lon + 180) / 360) * WIDTH).toFixed(1);
const y = (lat) => (((90 - lat) / 180) * HEIGHT).toFixed(1);

const polygons =
  land.type === 'FeatureCollection'
    ? land.features.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates))
    : land.geometry.type === 'Polygon'
      ? [land.geometry.coordinates]
      : land.geometry.coordinates;

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

let d = '';
let unwrapped = 0;
for (const polygon of polygons) {
  for (const ring of polygon) {
    const points = unwrap(ring);
    if (points.some(([lon]) => lon > 180 || lon < -180)) unwrapped += 1;
    d += points.map(([lon, lat], i) => `${i ? 'L' : 'M'}${x(lon)} ${y(lat)}`).join('') + 'Z';
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<rect width="${WIDTH}" height="${HEIGHT}" fill="#000"/>
<path d="${d}" fill="#fff" fill-rule="evenodd" transform="translate(${-WIDTH} 0)"/>
<path d="${d}" fill="#fff" fill-rule="evenodd"/>
<path d="${d}" fill="#fff" fill-rule="evenodd" transform="translate(${WIDTH} 0)"/>
</svg>`;

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images', 'globe-land.png');
await sharp(Buffer.from(svg)).toColourspace('b-w').png({ compressionLevel: 9 }).toFile(out);
const { size } = await sharp(out).metadata().then(async (m) => ({ size: (await import('node:fs')).statSync(out).size, ...m }));
console.log(`wrote ${path.relative(process.cwd(), out)} (${polygons.length} polygons, ${unwrapped} rings unwrapped past the edge, ${(size / 1024).toFixed(0)} KB)`);
