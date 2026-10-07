// Replace the lock-screen date in the 01-morning clip's frames: a glyph mask
// erases the old letters with ffmpeg's removelogo, then the new date is drawn
// in the same face, colour and cap height and overlaid at the same centre.
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const S = process.env.S;
const FRAME = `${S}/m01-first.png`;
const W = 1206, H = 2622;
const region = { left: 440, top: 245, width: 330, height: 70 }; // generous box around "Sat 1. Jan"
const COLOR = 'rgb(180,182,222)';
const CAP_TOP = 262, CAP_BOTTOM = 299, CENTER_X = 600; // measured on the original
const NEW_TEXT = process.env.NEW_TEXT || 'Thu 24. Sep';

// 1. Glyph mask: bright pixels inside the region, dilated by 2 px.
const { data, info } = await sharp(FRAME).extract(region).raw().toBuffer({ resolveWithObject: true });
const bright = new Uint8Array(info.width * info.height);
for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
  const i = (y * info.width + x) * 3;
  if (data[i] > 95 && data[i + 1] > 95 && data[i + 2] > 135 && data[i] + data[i + 1] > 200) bright[y * info.width + x] = 1;
}
const mask = Buffer.alloc(info.width * info.height, 0);
const R = 3;
for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
  let hit = 0;
  for (let dy = -R; dy <= R && !hit; dy++) for (let dx = -R; dx <= R; dx++) {
    const yy = y + dy, xx = x + dx;
    if (yy >= 0 && yy < info.height && xx >= 0 && xx < info.width && bright[yy * info.width + xx]) { hit = 1; break; }
  }
  if (hit) mask[y * info.width + x] = 255;
}
const maskTile = await sharp(mask, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } })
  .composite([{ input: maskTile, left: region.left, top: region.top }]).png().toFile(`${S}/date-mask.png`);
console.log('mask pixels:', mask.filter((v) => v).length);

// 2. Erase on the test frame.
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', FRAME, '-vf', `removelogo=${S}/date-mask.png`, `${S}/m01-erased.png`]);

// 3. Match the cap height: render the new text at candidate sizes and measure the "T".
const capOf = async (size, weight, family) => {
  const svg = `<svg width="600" height="160" xmlns="http://www.w3.org/2000/svg"><text x="20" y="110" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="#fff">${NEW_TEXT}</text></svg>`;
  const { data: d, info: i } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
  let minY = 1e9, maxY = 0, minX = 1e9, maxX = 0;
  for (let y = 0; y < i.height; y++) for (let x = 0; x < i.width; x++) {
    const p = (y * i.width + x) * i.channels;
    if (d[p + 3] > 170) { if (x < 60) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); } minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  }
  return { cap: maxY - minY + 1, width: maxX - minX + 1, top: minY, left: minX };
};
const target = CAP_BOTTOM - CAP_TOP + 1;
let chosen;
for (const family of ['SF Pro Text', 'SF Pro Display']) for (const weight of [500, 600]) {
  for (let size = 46; size <= 60; size++) {
    const m = await capOf(size, weight, family);
    if (m.cap >= target) { console.log(family, weight, 'size', size, 'cap', m.cap, 'width', m.width); if (!chosen && family === 'SF Pro Text' && weight === 600) chosen = { size, weight, family, ...m }; break; }
  }
}
console.log('original cap height', target, '→ chosen', chosen);

// 4. Draw the new date onto the erased frame, centred on the original centre with the same cap top.
const sz = chosen.size;
const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><text x="${CENTER_X}" y="${CAP_TOP + chosen.cap - 1 + (110 - (chosen.top + chosen.cap - 1)) - 110 + 110}" text-anchor="middle" font-family="${chosen.family}" font-size="${sz}" font-weight="${chosen.weight}" fill="${COLOR}">${NEW_TEXT}</text></svg>`;
// baseline: in the probe, baseline was y=110 and the cap top landed at chosen.top → offset = 110 - chosen.top
const baseline = CAP_TOP + (110 - chosen.top);
const textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><text x="${CENTER_X}" y="${baseline}" text-anchor="middle" font-family="${chosen.family}" font-size="${sz}" font-weight="${chosen.weight}" fill="${COLOR}">${NEW_TEXT}</text></svg>`;
await sharp(Buffer.from(textSvg)).png().toFile(`${S}/date-text.png`);
await sharp(`${S}/m01-erased.png`).composite([{ input: `${S}/date-text.png` }]).png().toFile(`${S}/m01-fixed.png`);

// Previews: zoomed, and at the film's phone scale, before / erased / fixed.
const zoom = (src) => sharp(src).extract({ left: 420, top: 220, width: 370, height: 120 }).resize(1110, 360, { kernel: 'lanczos3' }).png().toBuffer();
const film = (src) => sharp(src).extract({ left: 300, top: 150, width: 600, height: 300 }).resize(224, 112).resize(896, 448, { kernel: 'nearest' }).png().toBuffer();
const tiles = [await zoom(FRAME), await zoom(`${S}/m01-erased.png`), await zoom(`${S}/m01-fixed.png`)];
await sharp({ create: { width: 1110, height: 1080, channels: 3, background: '#000' } })
  .composite(tiles.map((input, i) => ({ input, left: 0, top: i * 360 }))).png().toFile(`${S}/date-fix-zoom.png`);
const films = [await film(FRAME), await film(`${S}/m01-fixed.png`)];
await sharp({ create: { width: 1792, height: 448, channels: 3, background: '#000' } })
  .composite(films.map((input, i) => ({ input, left: i * 896, top: 0 }))).png().toFile(`${S}/date-fix-film.png`);
console.log('previews written');
