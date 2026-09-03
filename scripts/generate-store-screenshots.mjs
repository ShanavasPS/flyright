/**
 * Frames raw device captures into store-ready marketing screenshots on the
 * brand's night-sky gradient, plus the Play Store icon and feature graphic.
 * Each store gets its own device: the App Store set is framed in an iPhone
 * (store-assets/raw/*.png, iPhone 17 sim, 1206×2622) and the Play set in a
 * Pixel (store-assets/raw/pixel/*.png, Pixel 9a emulator, 1080×2424) so the
 * Play listing never shows a Dynamic Island. Run after re-capturing raws:
 *   node scripts/generate-store-screenshots.mjs
 *
 * Outputs: store-assets/* (Play) and store/apple/screenshot/en-US/* (pushed
 * with `eas metadata:push`).
 */
import sharp from 'sharp';
import { mkdir, copyFile } from 'node:fs/promises';

// Brand night sky — keep in sync with scripts/generate-icons.mjs.
const NAVY = '#16345F';
const NAVY_DEEP = '#0B1D3E';
const NAVY_LIFT = '#2E5C9E';
const WHITE = '#FFFFFF';
const SUB = '#B9C8DE';
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Ordered store set: travel journal first (product vision), money second. */
const SHOTS = [
  {
    raw: 'phone-01-journeys.png',
    headline: 'Every flight, remembered',
    sub: 'Your travel journal with live delay tracking',
  },
  {
    raw: 'phone-05-travel-day.png',
    headline: 'Your travel day, live',
    sub: 'A boarding pass that counts you down to departure',
  },
  {
    raw: 'phone-03-verdict.png',
    headline: "Know what you're owed",
    sub: 'Instant EU261 compensation verdicts',
  },
  {
    raw: 'phone-06-world.png',
    headline: 'Your world, mapped',
    sub: "Every route you've flown, on one map",
  },
  {
    raw: 'phone-02-stats.png',
    headline: 'Your travels, in numbers',
    sub: 'Records, places and airlines from your history',
  },
  {
    raw: 'phone-04-add-flight.png',
    headline: 'Add flights in seconds',
    sub: 'Scan your boarding pass — or just type the number',
  },
];

/** Raw capture geometry + bezel proportions per device mockup. */
const DEVICES = {
  iphone: { rawDir: 'store-assets/raw', rawW: 1206, rawH: 2622, bezel: 0.03, radius: 0.14 },
  // Pixel 9a: slimmer bezel, tighter corners, centred punch-hole camera.
  pixel: { rawDir: 'store-assets/raw/pixel', rawW: 1080, rawH: 2424, bezel: 0.022, radius: 0.1, punchHole: true },
};

const bgDefs = `
  <linearGradient id="bg" x1="0" y1="1" x2="0.85" y2="0">
    <stop offset="0" stop-color="${NAVY_DEEP}"/>
    <stop offset="0.55" stop-color="${NAVY}"/>
    <stop offset="1" stop-color="${NAVY_LIFT}"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.12" r="0.9">
    <stop offset="0" stop-color="${WHITE}" stop-opacity="0.12"/>
    <stop offset="1" stop-color="${WHITE}" stop-opacity="0"/>
  </radialGradient>`;

const routeArcs = (W, H) => `
  <path d="M ${-W * 0.1} ${H * 0.85} Q ${W * 0.5} ${H * 0.6} ${W * 1.1} ${H * 0.75}"
    fill="none" stroke="${WHITE}" stroke-opacity="0.06"
    stroke-width="${W * 0.006}" stroke-dasharray="${W * 0.0008} ${W * 0.02}" stroke-linecap="round"/>
  <path d="M ${-W * 0.1} ${H * 0.22} Q ${W * 0.35} ${H * 0.1} ${W * 1.05} ${H * 0.18}"
    fill="none" stroke="${WHITE}" stroke-opacity="0.05"
    stroke-width="${W * 0.006}" stroke-dasharray="${W * 0.0008} ${W * 0.02}" stroke-linecap="round"/>`;

/** One framed screenshot: caption on top, device mockup below. */
async function frame({ W, H, raw, headline, sub, out, device }) {
  const { rawDir, rawW: RAW_W, rawH: RAW_H, punchHole } = DEVICES[device];
  const headSize = Math.round(W * 0.055);
  const subSize = Math.round(W * 0.028);
  const headY = Math.round(H * 0.062);
  const subY = headY + headSize * 0.95;
  const captionBottom = subY + subSize * 2;

  // Device sized to fill the space under the caption, capped by width.
  const areaH = H - captionBottom - H * 0.04;
  let shotH = Math.round(areaH);
  let shotW = Math.round((shotH * RAW_W) / RAW_H);
  if (shotW > W * 0.82) {
    shotW = Math.round(W * 0.82);
    shotH = Math.round((shotW * RAW_H) / RAW_W);
  }
  const bezel = Math.round(shotW * DEVICES[device].bezel);
  const devW = shotW + bezel * 2;
  const devH = shotH + bezel * 2;
  const devX = Math.round((W - devW) / 2);
  const devY = Math.round(captionBottom + (areaH - devH) / 2 + H * 0.01);
  const devR = Math.round(shotW * DEVICES[device].radius);
  const shotR = devR - bezel;

  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>${bgDefs}
      <filter id="devShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="${H * 0.008}" stdDeviation="${H * 0.012}"
          flood-color="#020818" flood-opacity="0.55"/>
      </filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${routeArcs(W, H)}
    <text x="${W / 2}" y="${headY}" text-anchor="middle" font-family="${FONT}"
      font-size="${headSize}" font-weight="700" fill="${WHITE}">${headline}</text>
    <text x="${W / 2}" y="${subY}" text-anchor="middle" font-family="${FONT}"
      font-size="${subSize}" font-weight="500" fill="${SUB}">${sub}</text>
    <rect x="${devX}" y="${devY}" width="${devW}" height="${devH}" rx="${devR}"
      fill="#0A1424" filter="url(#devShadow)"/>
  </svg>`);

  const screenshot = await sharp(`${rawDir}/${raw}`)
    .resize(shotW, shotH)
    .composite([
      {
        input: Buffer.from(
          `<svg width="${shotW}" height="${shotH}"><rect width="${shotW}" height="${shotH}" rx="${shotR}" fill="#fff"/></svg>`,
        ),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  const layers = [{ input: screenshot, left: devX + bezel, top: devY + bezel }];
  if (punchHole) {
    // Camera sits in the status bar, level with the clock.
    const r = Math.round(shotW * 0.02);
    const cy = Math.round(shotH * 0.024);
    layers.push({
      input: Buffer.from(
        `<svg width="${shotW}" height="${shotH}"><circle cx="${shotW / 2}" cy="${cy}" r="${r}" fill="#0A1424"/></svg>`,
      ),
      left: devX + bezel,
      top: devY + bezel,
    });
  }

  await sharp(base).composite(layers).png().toFile(out);
  console.log('wrote', out);
}

/** Play feature graphic: icon + wordmark + tagline on the night sky. */
async function featureGraphic(out) {
  const W = 1024;
  const H = 500;
  const icon = await sharp('assets/images/icon.png')
    .resize(300, 300)
    .composite([
      {
        input: Buffer.from(`<svg width="300" height="300"><rect width="300" height="300" rx="66" fill="#fff"/></svg>`),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>${bgDefs}</defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${routeArcs(W, H)}
    <text x="400" y="230" font-family="${FONT}" font-size="86" font-weight="700"
      fill="${WHITE}">FlyRight</text>
    <text x="402" y="290" font-family="${FONT}" font-size="34" font-weight="500"
      fill="${SUB}">Get paid for flight delays</text>
  </svg>`);

  await sharp(base)
    .composite([{ input: icon, left: 72, top: 100 }])
    .png()
    .toFile(out);
  console.log('wrote', out);
}

const TARGETS = [
  { dir: 'store-assets', prefix: 'appstore-65', W: 1284, H: 2778, device: 'iphone' },
  { dir: 'store-assets', prefix: 'phone', W: 1080, H: 1920, device: 'pixel' },
  { dir: 'store-assets', prefix: 'tablet7', W: 1600, H: 2560, device: 'pixel' },
  { dir: 'store-assets', prefix: 'tablet10', W: 2048, H: 2732, device: 'pixel' },
];

for (const { dir, prefix, W, H, device } of TARGETS) {
  for (const [i, shot] of SHOTS.entries()) {
    await frame({ W, H, device, ...shot, out: `${dir}/${prefix}-0${i + 1}.png` });
  }
}

await featureGraphic('store-assets/feature-graphic-1024x500.png');
await sharp('assets/images/icon.png').resize(512, 512).png().toFile('store-assets/play-icon-512.png');
console.log('wrote store-assets/play-icon-512.png');

// Mirror the Apple sets into the EAS Metadata tree.
const IPHONE_DIR = 'store/apple/screenshot/en-US/APP_IPHONE_65';
const IPAD_DIR = 'store/apple/screenshot/en-US/APP_IPAD_PRO_3GEN_129';
await mkdir(IPHONE_DIR, { recursive: true });
await mkdir(IPAD_DIR, { recursive: true });
// The iPad set is NOT mirrored from framed tablet panels anymore: App Review
// requires real iPad captures, so store/apple/screenshot/en-US/APP_IPAD_PRO_3GEN_129
// holds the ipad-shot-* files uploaded to ASC on 2026-08-28. Leave it alone.
for (let i = 1; i <= SHOTS.length; i++) {
  await copyFile(`store-assets/appstore-65-0${i}.png`, `${IPHONE_DIR}/appstore-65-0${i}.png`);
}
console.log('mirrored Apple sets into store/apple');
