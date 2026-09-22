// Compares two screenshots below a status-bar strip, for the wide-layouts
// phone-width regression check (docs/wide-layouts-plan.md §9, Pass 2).
//   node scripts/wide-layouts/pixdiff.cjs <before.png> <after.png> [skipTopPx]
// Prints "identical", or how many pixels differ (beyond a small colour
// tolerance, so PNG encoder noise does not count) and where.
const fs = require('fs');
const { PNG } = require('pngjs');

const [a, b, skip = '0'] = process.argv.slice(2);
if (!a || !b) {
  console.error('usage: pixdiff.cjs <before.png> <after.png> [skipTopPx]');
  process.exit(2);
}
const A = PNG.sync.read(fs.readFileSync(a));
const B = PNG.sync.read(fs.readFileSync(b));
if (A.width !== B.width || A.height !== B.height) {
  console.log(`size differs ${A.width}x${A.height} vs ${B.width}x${B.height}`);
  process.exit(1);
}
let n = 0;
let x0 = Infinity;
let y0 = Infinity;
let x1 = -1;
let y1 = -1;
for (let y = Number(skip); y < A.height; y++) {
  for (let x = 0; x < A.width; x++) {
    const i = (y * A.width + x) * 4;
    const d =
      Math.abs(A.data[i] - B.data[i]) +
      Math.abs(A.data[i + 1] - B.data[i + 1]) +
      Math.abs(A.data[i + 2] - B.data[i + 2]);
    if (d > 24) {
      n++;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
}
const total = A.width * (A.height - Number(skip));
console.log(n ? `${n} px differ (${((100 * n) / total).toFixed(2)}%), box x${x0}-${x1} y${y0}-${y1}` : 'identical');
process.exit(n ? 1 : 0);
