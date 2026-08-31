/**
 * Builds the bundled world-map silhouette (assets/data/world-map.json) for the
 * World tab. Bundled rather than tile-served for the same reason as
 * airports.json: the map must render offline — this app gets used on planes.
 *
 * Source: Natural Earth 1:110m land via the world-atlas package (public
 * domain). Run: node scripts/build-world-map.mjs
 *
 * Output: { width, height, latTop, latBottom, land } where `land` is a single
 * SVG path (evenodd) in an equirectangular projection cropped to
 * [latBottom, latTop] — Antarctica is dropped so the map doesn't waste a
 * third of its height on ice nobody has a boarding pass for.
 */
import { writeFile } from 'node:fs/promises';

const SOURCE = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json';

const WIDTH = 1000;
const LAT_TOP = 84; // matches the Web-Mercator-style crop of most world maps
const LAT_BOTTOM = -57; // just south of Cape Horn; everything below is Antarctica
const HEIGHT = Math.round((WIDTH * (LAT_TOP - LAT_BOTTOM)) / 360); // 392

const project = ([lon, lat]) => [
  ((lon + 180) / 360) * WIDTH,
  ((LAT_TOP - Math.min(LAT_TOP, Math.max(LAT_BOTTOM, lat))) / (LAT_TOP - LAT_BOTTOM)) * HEIGHT,
];

/** Minimal TopoJSON arc decoder — world-atlas is quantized + delta-encoded. */
function decodeArcs(topo) {
  const { scale, translate } = topo.transform;
  return topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
}

/** Stitch a TopoJSON ring (list of arc indices, ~n means reversed arc n). */
function ring(arcIndexes, arcs) {
  const points = [];
  for (const index of arcIndexes) {
    const arc = index < 0 ? arcs[~index].slice().reverse() : arcs[index];
    // Consecutive arcs share their join point; skip it after the first arc.
    points.push(...(points.length ? arc.slice(1) : arc));
  }
  return points;
}

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`${SOURCE} -> HTTP ${response.status}`);
const topo = await response.json();

const arcs = decodeArcs(topo);
// objects.land is a GeometryCollection holding one MultiPolygon of every landmass.
const land = topo.objects.land.geometries[0];
const paths = [];
let droppedRings = 0;

for (const polygon of land.arcs) {
  for (const arcIndexes of polygon) {
    const points = ring(arcIndexes, arcs);
    // Drop rings living entirely below the crop (Antarctica + its islands).
    if (points.every(([, lat]) => lat < LAT_BOTTOM)) {
      droppedRings += 1;
      continue;
    }
    // Rings that wrap the antimeridian (Chukotka, Fiji) would otherwise draw
    // a segment clean across the map; break the path there and let SVG's
    // implicit close supply a vertical edge at ±180° instead.
    let d = '';
    for (let i = 0; i < points.length; i += 1) {
      const [x, y] = project(points[i]);
      const wraps = i > 0 && Math.abs(points[i][0] - points[i - 1][0]) > 180;
      d += `${i === 0 ? 'M' : wraps ? 'ZM' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    paths.push(`${d}Z`);
  }
}

const json = JSON.stringify({
  width: WIDTH,
  height: HEIGHT,
  latTop: LAT_TOP,
  latBottom: LAT_BOTTOM,
  land: paths.join(''),
});

await writeFile('assets/data/world-map.json', json);
console.log(
  `wrote assets/data/world-map.json (${(json.length / 1024).toFixed(0)} kB, ` +
    `${paths.length} rings, ${droppedRings} dropped below ${LAT_BOTTOM}°)`,
);
