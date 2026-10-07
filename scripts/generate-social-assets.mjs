/**
 * Social profile assets (TikTok / Instagram / LinkedIn) drawn from the same
 * brand glyph as the app icon. Run: node scripts/generate-social-assets.mjs
 *
 * - avatar-*.png: 1024² squares; the glyph sits at 74% so a circular crop
 *   never clips the plane. `night` matches the splash / dark icon and holds
 *   up on the white feeds; `porcelain` matches the store icon.
 * - linkedin-cover.png: 1128×191 company banner with the pitch line and the
 *   real World-tab globe (cut from store-assets/raw/phone-06-world.png) rising
 *   from the bottom edge. Travel buddy first: no green, which is money-only.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { bg, bgLight, glyph, svg } from './generate-icons.mjs';

const OUT = 'store-assets/social';
const WHITE = '#FFFFFF';
const SILVER = '#B8C6DC';
const TINT = '#4E9BF5';

// The World capture's globe: centre and radius in capture pixels, and where
// it sits on the 1× banner.
const GLOBE_SRC = { file: 'store-assets/raw/phone-06-world.png', cx: 603, cy: 1173, r: 545 };
const GLOBE = { cx: 1012, cy: 118, r: 104 };

const night = { top: '#0C1F3E', mid: '#071224', bottom: '#03060E' };

const cover = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="cb" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="${night.bottom}"/>
      <stop offset="0.6" stop-color="${night.mid}"/>
      <stop offset="1" stop-color="${night.top}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.8" stop-color="${TINT}" stop-opacity="0.45"/>
      <stop offset="1" stop-color="${TINT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#cb)"/>
  <path d="M -40 ${h * 0.9} Q ${w * 0.45} ${h * 0.1} ${w + 40} ${h * 0.55}"
    fill="none" stroke="${WHITE}" stroke-opacity="0.08" stroke-width="3"
    stroke-dasharray="0.5 16" stroke-linecap="round"/>
  <circle cx="${GLOBE.cx}" cy="${GLOBE.cy}" r="${GLOBE.r * 1.2}" fill="url(#glow)"/>
  <!-- LinkedIn overlays the page logo on the bottom-left corner; keep copy clear of it. -->
  <text x="300" y="80" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
    font-size="32" font-weight="700" fill="${WHITE}" letter-spacing="-0.5">Your travel buddy on the day you fly.</text>
  <text x="300" y="120" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
    font-size="24" font-weight="600" fill="${SILVER}" letter-spacing="-0.3">Live flight updates. Friends who follow along.</text>
  <text x="300" y="158" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
    font-size="15" fill="${WHITE}" fill-opacity="0.7">getflyright.com · Free on the App Store and Google Play</text>
</svg>`;

await mkdir(OUT, { recursive: true });

const jobs = [
  ['avatar-night.png', svg(1024, bg(1024, night) + glyph(1024, 0.74, { scheme: 'dark' }))],
  ['avatar-porcelain.png', svg(1024, bgLight(1024) + glyph(1024, 0.74))],
  ['linkedin-cover.png', Buffer.from(cover(1128, 191))],
];

/** The globe cut from the capture as a circle, sized for the 2× banner. */
async function globeDisc() {
  const { file, cx, cy, r } = GLOBE_SRC;
  const size = GLOBE.r * 2 * 2;
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
  return sharp(file)
    .extract({ left: cx - r, top: cy - r, width: r * 2, height: r * 2 })
    .resize(size, size)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

for (const [name, buffer] of jobs) {
  // The cover is authored at 1× and rasterised at 2× (density 144) so text stays crisp.
  const density = name === 'linkedin-cover.png' ? 144 : 72;
  let image = sharp(buffer, { density });
  if (name === 'linkedin-cover.png') {
    // Composite onto the full disc, then crop it at the banner's bottom edge.
    const base = await image.png().toBuffer();
    const top = (GLOBE.cy - GLOBE.r) * 2;
    const tall = await sharp(base)
      .extend({ bottom: Math.max(0, top + GLOBE.r * 4 - 191 * 2), background: '#000' })
      .composite([{ input: await globeDisc(), left: (GLOBE.cx - GLOBE.r) * 2, top }])
      .png()
      .toBuffer();
    image = sharp(tall).extract({ left: 0, top: 0, width: 1128 * 2, height: 191 * 2 });
  }
  await image.png().toFile(`${OUT}/${name}`);
  console.log('wrote', `${OUT}/${name}`);
}
