/**
 * Generates the World tab's Android plane marker bitmaps. Run:
 * node scripts/generate-plane-marker.mjs
 *
 * Google Maps draws markers from bitmaps, and react-native-maps snapshots a
 * custom marker view once — react-native-svg has usually not drawn by then,
 * so on Android the plane is supplied as a ready image and rotated with the
 * marker's native `rotation`. iOS keeps the live SVG (Apple Maps ignores
 * `rotation`, so the view rotates itself). One image per colour scheme,
 * matching Colors.light.tint / Colors.dark.tint, at 1x/2x/3x. The glyph is
 * 22pt in a 40pt transparent frame — the frame is the tap target.
 */
import sharp from 'sharp';

/** Material "flight" airliner silhouette, viewBox 0 0 24 24, nose up — the
 * same glyph generate-icons.mjs uses (not imported: that module generates
 * every app icon on import). */
const PLANE_PATH =
  'M21 16v-2l-8-5V3.5C13 2.67 12.33 2 11.5 2S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16z';

const FRAME = 40;
const GLYPH = 22;
const TINTS = { light: '#1E6BE0', dark: '#4E9BF5' };

const svg = (tint) => {
  const offset = (FRAME - GLYPH) / 2;
  const scale = GLYPH / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME}" height="${FRAME}" viewBox="0 0 ${FRAME} ${FRAME}">
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <path d="${PLANE_PATH}" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round"/>
    <path d="${PLANE_PATH}" fill="${tint}"/>
  </g>
</svg>`;
};

for (const [scheme, tint] of Object.entries(TINTS)) {
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    await sharp(Buffer.from(svg(tint)), { density: 72 * scale })
      .png()
      .toFile(`assets/images/plane-marker-${scheme}${suffix}.png`);
  }
}
console.log('plane markers written');
