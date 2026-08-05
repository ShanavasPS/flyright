/**
 * Generates all app icon / splash assets from the brand theme so they stay
 * reproducible. Run: node scripts/generate-icons.mjs
 *
 * Glyph: a paper plane (flight) with the payout-green window dot — white on
 * altitude blue #208AEF (see src/constants/theme.ts and the memory note).
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const BLUE = '#208AEF';
const BLUE_DEEP = '#1668C7';
const GREEN = '#2DB874';
const WHITE = '#FFFFFF';

/** Feather "send" paper plane, viewBox 0 0 24 24, stroke-based. */
const plane = (stroke, width = 2) => `
  <g fill="none" stroke="${stroke}" stroke-width="${width}"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 2 L11 13" />
    <path d="M22 2 L15 22 L11 13 L2 9 Z" />
  </g>`;

/** The glyph centered in a `size` box, occupying `scale` of it. */
const glyph = (size, scale, { withDot = true } = {}) => {
  const g = size * scale;
  const offset = (size - g) / 2;
  return `
  <g transform="translate(${offset} ${offset}) scale(${g / 24})">
    ${plane(WHITE)}
    ${withDot ? `<circle cx="11" cy="13" r="1.6" fill="${GREEN}"/>` : ''}
  </g>`;
};

const svg = (size, inner) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"
    viewBox="0 0 ${size} ${size}">${inner}</svg>`);

const bgGradient = (size) => `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BLUE}"/>
      <stop offset="1" stop-color="${BLUE_DEEP}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>`;

const out = (name) => `assets/images/${name}`;

await mkdir('assets/images', { recursive: true });

const jobs = [
  // App icon: full-bleed blue, glyph at 58% (stores apply their own masks).
  ['icon.png', svg(1024, bgGradient(1024) + glyph(1024, 0.58))],
  // Android adaptive: glyph within the ~66% safe zone; solid backgrounds.
  ['android-icon-foreground.png', svg(1024, glyph(1024, 0.42))],
  ['android-icon-background.png', svg(1024, bgGradient(1024))],
  ['android-icon-monochrome.png', svg(1024, glyph(1024, 0.42, { withDot: false }))],
  // Splash: white glyph on transparent — splash background color is set in app.json.
  ['splash-icon.png', svg(512, glyph(512, 0.9, { withDot: false }))],
  ['favicon.png', svg(48, bgGradient(48) + glyph(48, 0.7))],
];

for (const [name, buffer] of jobs) {
  await sharp(buffer).png().toFile(out(name));
  console.log('wrote', out(name));
}
