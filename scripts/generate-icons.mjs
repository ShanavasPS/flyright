/**
 * Generates all app icon / splash assets from the brand theme so they stay
 * reproducible. Run: node scripts/generate-icons.mjs
 *
 * Glyph: "the contrail check" — an airliner climbing at 45° whose contrail
 * sweeps into a checkmark (flight + claim approved). White plane and
 * payout-green trail on midnight navy (see src/constants/theme.ts).
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const NAVY = '#0C1B36';
const NAVY_DEEP = '#060F22';
const NAVY_LIFT = '#16325E';
const GREEN = '#12B76A';
const GREEN_BRIGHT = '#3EE49E';
const WHITE = '#FFFFFF';

/** Material "flight" airliner silhouette, viewBox 0 0 24 24, nose up. */
const PLANE_PATH =
  'M21 16v-2l-8-5V3.5C13 2.67 12.33 2 11.5 2S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16z';

/**
 * The glyph in a 120×120 design box: check-shaped contrail rising into the
 * plane at its tip. `mono` renders it single-color for monochrome/tinted use.
 */
const glyphInner = ({ mono = null } = {}) => `
  <defs>
    <linearGradient id="trail" x1="0.15" y1="0.75" x2="0.72" y2="0.35">
      <stop offset="0" stop-color="${GREEN}"/>
      <stop offset="1" stop-color="${GREEN_BRIGHT}"/>
    </linearGradient>
    <filter id="lift" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#02060F" flood-opacity="0.25"/>
    </filter>
  </defs>
  <path d="M20 64 L42 86 L68 60" fill="none"
    stroke="${mono ?? 'url(#trail)'}" stroke-width="15"
    stroke-linecap="round" stroke-linejoin="round"
    ${mono ? 'opacity="0.75"' : ''}/>
  <g transform="translate(90 32) rotate(45) scale(2.1) translate(-11.5 -12)"
     ${mono ? '' : 'filter="url(#lift)"'}>
    <path d="${PLANE_PATH}" fill="${mono ?? WHITE}"/>
  </g>`;

/** The 120-box glyph centered in a `size` box, occupying `scale` of it. */
const glyph = (size, scale, opts) => {
  const g = size * scale;
  // The composite mark reads slightly up-right heavy; nudge to optical center.
  const dx = (size - g) / 2 - g * 0.015;
  const dy = (size - g) / 2 + g * 0.03;
  return `
  <g transform="translate(${dx} ${dy}) scale(${g / 120})">
    ${glyphInner(opts)}
  </g>`;
};

const svg = (size, inner) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"
    viewBox="0 0 ${size} ${size}">${inner}</svg>`);

/** Midnight-navy ground with a faint route arc and a glow where the plane flies. */
const bg = (size, { top = NAVY_LIFT, bottom = NAVY_DEEP, mid = NAVY } = {}) => `
  <defs>
    <linearGradient id="bg" x1="0" y1="1" x2="0.85" y2="0">
      <stop offset="0" stop-color="${bottom}"/>
      <stop offset="0.55" stop-color="${mid}"/>
      <stop offset="1" stop-color="${top}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.72" cy="0.26" r="0.75">
      <stop offset="0" stop-color="${WHITE}" stop-opacity="0.10"/>
      <stop offset="1" stop-color="${WHITE}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <rect width="${size}" height="${size}" fill="url(#glow)"/>
  <path d="M ${-size * 0.1} ${size * 0.82} Q ${size * 0.5} ${size * 0.46} ${size * 1.1} ${size * 0.7}"
    fill="none" stroke="${WHITE}" stroke-opacity="0.07"
    stroke-width="${size * 0.012}" stroke-dasharray="${size * 0.001} ${size * 0.035}"
    stroke-linecap="round"/>
  <path d="M ${-size * 0.1} ${size * 0.3} Q ${size * 0.4} ${size * 0.1} ${size * 1.05} ${size * 0.26}"
    fill="none" stroke="${WHITE}" stroke-opacity="0.05"
    stroke-width="${size * 0.012}" stroke-dasharray="${size * 0.001} ${size * 0.035}"
    stroke-linecap="round"/>`;

const out = (name) => `assets/images/${name}`;

await mkdir('assets/images', { recursive: true });

const jobs = [
  // App icon: full-bleed navy, glyph at 66% (stores apply their own masks).
  ['icon.png', svg(1024, bg(1024) + glyph(1024, 0.66))],
  // iOS dark-mode icon: near-black navy so it recedes on dark home screens.
  [
    'ios-icon-dark.png',
    svg(1024, bg(1024, { top: '#0C1F3E', mid: '#071224', bottom: '#03060E' }) + glyph(1024, 0.66)),
  ],
  // iOS tinted icon: grayscale glyph on transparent; the system supplies color.
  ['ios-icon-tinted.png', svg(1024, glyph(1024, 0.66, { mono: WHITE }))],
  // Android adaptive: glyph within the ~66% safe zone; navy background layer.
  ['android-icon-foreground.png', svg(1024, glyph(1024, 0.42))],
  ['android-icon-background.png', svg(1024, bg(1024))],
  ['android-icon-monochrome.png', svg(1024, glyph(1024, 0.42, { mono: WHITE }))],
  // Splash: glyph on transparent — splash background color is set in app.json.
  ['splash-icon.png', svg(512, glyph(512, 0.9))],
  ['favicon.png', svg(48, bg(48) + glyph(48, 0.8))],
];

for (const [name, buffer] of jobs) {
  await sharp(buffer).png().toFile(out(name));
  console.log('wrote', out(name));
}
