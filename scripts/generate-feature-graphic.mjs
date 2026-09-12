/**
 * Play Store feature graphic (1024×500), the first thing a searcher sees on
 * Play. Night-sky navy with the bundled world silhouette faded into the
 * ground, a glowing cobalt→payout-green route arc sweeping across the whole
 * canvas into the airliner, the wordmark + travel-day tagline on the left and
 * a Pixel mockup of the live home screen leaning in from the right.
 * Run: node scripts/generate-feature-graphic.mjs
 * (generate-store-screenshots.mjs calls this too, so one command rebuilds all.)
 */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const W = 1024;
const H = 500;
/** Everything is composed at 2× and downscaled once at the end: resizing the
 * capture to phone size and then rotating it resamples twice at final scale
 * and the screen comes out soft. */
const SCALE = 2;
const OUT = 'store-assets/feature-graphic-1024x500.png';

const WHITE = '#FFFFFF';
const SUB = '#B9C8DE';
const COBALT = '#4E9BF5';
const GREEN = '#2FD68C';
const GREEN_BRIGHT = '#6FF0B4';
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
/** Material "flight" airliner, nose up (same path as generate-icons.mjs, which
 * regenerates every icon on import, so it is copied rather than imported). */
const PLANE_PATH =
  'M21 16v-2l-8-5V3.5C13 2.67 12.33 2 11.5 2S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16z';

/** Route arc: a quadratic sweep from bottom-left to the plane top-right of
 * the text block, drawn once blurred (glow) and once crisp. */
const ROUTE = 'M -40 470 Q 300 430 620 250 T 900 96';

const worldPath = async () => {
  const { land, width } = JSON.parse(await readFile('assets/data/world-map.json', 'utf8'));
  // Fill the canvas width; the map is wider than tall so only its middle
  // band (Europe → Asia) shows, bleeding off the bottom.
  const s = (W * 1.18) / width;
  return `<g transform="translate(${-W * 0.09} ${H * 0.05}) scale(${s})" opacity="0.14">
    <path d="${land}" fill="${COBALT}" fill-rule="evenodd"/>
  </g>`;
};

const phoneMockup = async () => {
  // Pixel 9a capture of the live home screen, framed and leaned in at -9°.
  const shotW = 336 * SCALE;
  const shotH = Math.round((shotW * 2424) / 1080);
  const bezel = Math.round(shotW * 0.022);
  const devW = shotW + bezel * 2;
  const devH = shotH + bezel * 2;
  const devR = Math.round(shotW * 0.1);
  const punchR = Math.round(shotW * 0.02);
  const punchY = Math.round(shotH * 0.024);

  const shot = await sharp('store-assets/raw/pixel/phone-01-journeys.png')
    .resize(shotW, shotH)
    .composite([
      {
        input: Buffer.from(
          `<svg width="${shotW}" height="${shotH}"><rect width="${shotW}" height="${shotH}" rx="${devR - bezel}" fill="#fff"/></svg>`,
        ),
        blend: 'dest-in',
      },
      {
        input: Buffer.from(
          `<svg width="${shotW}" height="${shotH}"><circle cx="${shotW / 2}" cy="${punchY}" r="${punchR}" fill="#0A1424"/></svg>`,
        ),
      },
    ])
    .png()
    .toBuffer();

  const device = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${devW}" height="${devH}">
        <rect width="${devW}" height="${devH}" rx="${devR}" fill="#0A1424"/>
        <rect x="1" y="1" width="${devW - 2}" height="${devH - 2}" rx="${devR - 1}"
          fill="none" stroke="#3A4C6B" stroke-width="1.5"/>
      </svg>`,
    ),
  )
    .composite([{ input: shot, left: bezel, top: bezel }])
    .png()
    .toBuffer();

  return sharp(device)
    .rotate(-9, { background: { r: 0, g: 0, b: 0, alpha: 0 }, interpolator: 'bicubic' })
    .png()
    .toBuffer();
};

export async function generateFeatureGraphic() {
  const world = await worldPath();
  const phone = await phoneMockup();
  const phoneMeta = await sharp(phone).metadata();
  const phoneLeft = 628 * SCALE;
  const phoneTop = 128 * SCALE;

  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${H * SCALE}"
    viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="sky" x1="0" y1="1" x2="0.9" y2="0">
        <stop offset="0" stop-color="#03070F"/>
        <stop offset="0.5" stop-color="#0A1A36"/>
        <stop offset="1" stop-color="#14356A"/>
      </linearGradient>
      <radialGradient id="aurora" cx="0.78" cy="0.1" r="0.6">
        <stop offset="0" stop-color="${COBALT}" stop-opacity="0.38"/>
        <stop offset="1" stop-color="${COBALT}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="ground" cx="0.2" cy="1.05" r="0.7">
        <stop offset="0" stop-color="${GREEN}" stop-opacity="0.16"/>
        <stop offset="1" stop-color="${GREEN}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="route" gradientUnits="userSpaceOnUse" x1="0" y1="470" x2="900" y2="96">
        <stop offset="0" stop-color="${COBALT}" stop-opacity="0"/>
        <stop offset="0.35" stop-color="${COBALT}"/>
        <stop offset="1" stop-color="${GREEN_BRIGHT}"/>
      </linearGradient>
      <filter id="glow" x="-20%" y="-40%" width="140%" height="180%">
        <feGaussianBlur stdDeviation="14"/>
      </filter>
      <filter id="planeGlow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="8"/>
      </filter>
      <filter id="phoneShadow" x="-30%" y="-20%" width="160%" height="150%">
        <feDropShadow dx="-10" dy="18" stdDeviation="22" flood-color="#000714" flood-opacity="0.7"/>
      </filter>
    </defs>

    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    ${world}
    <rect width="${W}" height="${H}" fill="url(#aurora)"/>
    <rect width="${W}" height="${H}" fill="url(#ground)"/>

    <!-- faint great-circle grid -->
    <g fill="none" stroke="${WHITE}" stroke-opacity="0.045" stroke-width="1.5">
      <path d="M -50 150 Q 512 -40 1074 170"/>
      <path d="M -50 330 Q 512 120 1074 350"/>
      <path d="M -50 520 Q 512 280 1074 540"/>
    </g>

    <!-- the route: glow, crisp line, and vapor dots that grow into the plane -->
    <path d="${ROUTE}" fill="none" stroke="url(#route)" stroke-width="18"
      stroke-linecap="round" filter="url(#glow)" opacity="0.9"/>
    <path d="${ROUTE}" fill="none" stroke="url(#route)" stroke-width="4"
      stroke-linecap="round"/>
    <g fill="${GREEN_BRIGHT}">
      <circle cx="760" cy="174" r="4.5" opacity="0.55"/>
      <circle cx="800" cy="152" r="5.5" opacity="0.7"/>
      <circle cx="840" cy="130" r="6.5" opacity="0.85"/>
      <circle cx="880" cy="108" r="7.5"/>
    </g>
    <g transform="translate(922 82) rotate(62) scale(3.2) translate(-11.5 -12)">
      <path d="${PLANE_PATH}" fill="${GREEN_BRIGHT}" filter="url(#planeGlow)" opacity="0.9"/>
      <path d="${PLANE_PATH}" fill="${WHITE}"/>
    </g>

    <!-- wordmark + tagline -->
    <g transform="translate(72 0)">
      <rect x="0" y="118" width="232" height="34" rx="17" fill="${WHITE}" fill-opacity="0.1"
        stroke="${WHITE}" stroke-opacity="0.22"/>
      <circle cx="20" cy="135" r="5" fill="${GREEN}"/>
      <text x="34" y="141" font-family="${FONT}" font-size="15" font-weight="700"
        letter-spacing="2.5" fill="${WHITE}">FLIGHT TRACKER</text>

      <text x="-4" y="252" font-family="${FONT}" font-size="104" font-weight="700"
        letter-spacing="-3" fill="${WHITE}">FlyRight</text>

      <text x="0" y="322" font-family="${FONT}" font-size="38" font-weight="700"
        letter-spacing="-0.5" fill="${WHITE}">Your travel day, live.</text>
      <text x="1" y="366" font-family="${FONT}" font-size="24" font-weight="500"
        fill="${SUB}">Gates, delays and boarding, live. Shared</text>
      <text x="1" y="398" font-family="${FONT}" font-size="24" font-weight="500"
        fill="${SUB}">with your people. Plus what you're owed.</text>
    </g>

    <!-- phone shadow sits under the composited mockup -->
    <g transform="translate(${phoneLeft / SCALE + 12} ${phoneTop / SCALE + 40}) rotate(-9)">
      <rect width="351" height="600" rx="36" fill="#020712" filter="url(#phoneShadow)" opacity="0.8"/>
    </g>
  </svg>`);

  // The mockup runs off the bottom edge; sharp refuses out-of-bounds
  // composites, so crop the overhang first.
  const visibleH = Math.min(phoneMeta.height, H * SCALE - phoneTop);
  const visibleW = Math.min(phoneMeta.width, W * SCALE - phoneLeft);
  const cropped = await sharp(phone).extract({ left: 0, top: 0, width: visibleW, height: visibleH }).png().toBuffer();

  const full = await sharp(base)
    .composite([{ input: cropped, left: phoneLeft, top: phoneTop }])
    .png()
    .toBuffer();
  await sharp(full).resize(W, H, { kernel: 'lanczos3' }).png().toFile(OUT);
  console.log('wrote', OUT);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  await generateFeatureGraphic();
}
