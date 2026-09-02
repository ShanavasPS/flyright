/**
 * Social profile assets (TikTok / Instagram / LinkedIn) drawn from the same
 * brand glyph as the app icon. Run: node scripts/generate-social-assets.mjs
 *
 * - avatar-*.png: 1024² squares; the glyph sits at 74% so a circular crop
 *   never clips the plane. `night` matches the splash / dark icon and holds
 *   up on the white feeds; `porcelain` matches the store icon.
 * - linkedin-cover.png: 1128×191 company banner with the pitch line.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { bg, bgLight, glyph, svg } from './generate-icons.mjs';

const OUT = 'store-assets/social';
const WHITE = '#FFFFFF';
const GREEN = '#3EE49E';

const night = { top: '#0C1F3E', mid: '#071224', bottom: '#03060E' };

const cover = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="cb" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="${night.bottom}"/>
      <stop offset="0.6" stop-color="${night.mid}"/>
      <stop offset="1" stop-color="${night.top}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#cb)"/>
  <path d="M -40 ${h * 0.9} Q ${w * 0.45} ${h * 0.1} ${w + 40} ${h * 0.55}"
    fill="none" stroke="${WHITE}" stroke-opacity="0.08" stroke-width="3"
    stroke-dasharray="0.5 16" stroke-linecap="round"/>
  <g transform="translate(${w - h * 1.05} 0)">${glyph(h, 0.72, { scheme: 'dark' })}</g>
  <!-- LinkedIn overlays the page logo on the bottom-left corner; keep copy clear of it. -->
  <text x="300" y="78" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
    font-size="34" font-weight="700" fill="${WHITE}" letter-spacing="-0.5">Trackers tell you it's late.</text>
  <text x="300" y="120" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
    font-size="34" font-weight="700" fill="${GREEN}" letter-spacing="-0.5">We tell you what you're owed.</text>
  <text x="300" y="158" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
    font-size="15" fill="${WHITE}" fill-opacity="0.7">getflyright.com · EU261 compensation, claimed from your pocket</text>
</svg>`;

await mkdir(OUT, { recursive: true });

const jobs = [
  ['avatar-night.png', svg(1024, bg(1024, night) + glyph(1024, 0.74, { scheme: 'dark' }))],
  ['avatar-porcelain.png', svg(1024, bgLight(1024) + glyph(1024, 0.74))],
  ['linkedin-cover.png', Buffer.from(cover(1128, 191))],
];

for (const [name, buffer] of jobs) {
  // The cover is authored at 1× and rasterised at 2× (density 144) so text stays crisp.
  const density = name === 'linkedin-cover.png' ? 144 : 72;
  await sharp(buffer, { density }).png().toFile(`${OUT}/${name}`);
  console.log('wrote', `${OUT}/${name}`);
}
