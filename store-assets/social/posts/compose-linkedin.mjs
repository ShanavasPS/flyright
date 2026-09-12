import { createRequire } from 'node:module';
const sharp = createRequire(new URL('../../../package.json', import.meta.url))('sharp');

import { readFileSync } from 'node:fs';
const CFG = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const OUT = CFG.out;
const W = 1200, H = 1200;
const WHITE = '#FFFFFF', GREEN = '#3EE49E';
const night = { top: '#0C1F3E', mid: '#071224', bottom: '#03060E' };
const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';

const PHONE_H = 770;
const TOP = 398;

async function phone(file, cornerPx, srcW, { hole = false } = {}) {
  const meta = await sharp(file).metadata();
  const h = PHONE_H;
  const w = Math.round((meta.width / meta.height) * h);
  const s = w / srcW;
  const r = Math.round(cornerPx * s);
  const screen = await sharp(file).resize(w, h).png().toBuffer();
  const mask = Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
  const layers = [{ input: mask, blend: 'dest-in' }];
  if (hole) {
    // Pixel punch-hole camera, centred in the status bar.
    layers.push({ input: Buffer.from(`<svg width="${w}" height="${h}"><circle cx="${w / 2}" cy="${Math.round(62 * s)}" r="${Math.round(24 * s)}" fill="#000"/><circle cx="${w / 2}" cy="${Math.round(62 * s)}" r="${Math.round(10 * s)}" fill="#0E1A2A"/></svg>`) });
  }
  const rounded = await sharp(screen).composite(layers).png().toBuffer();
  const bz = 12;
  const frame = Buffer.from(`<svg width="${w + bz * 2}" height="${h + bz * 2}">
    <rect x="0" y="0" width="${w + bz * 2}" height="${h + bz * 2}" rx="${r + bz}" ry="${r + bz}" fill="#0B0F19"/>
    <rect x="2.5" y="2.5" width="${w + bz * 2 - 5}" height="${h + bz * 2 - 5}" rx="${r + bz - 2.5}" ry="${r + bz - 2.5}" fill="none" stroke="#3A4358" stroke-width="2"/>
  </svg>`);
  const framed = await sharp(frame).composite([{ input: rounded, left: bz, top: bz }]).png().toBuffer();
  return { buf: framed, w: w + bz * 2, h: h + bz * 2 };
}

const ios = await phone(CFG.ios, 165, 1206);
const and = await phone(CFG.android, 100, 1080, { hole: true });

const gap = 64;
const totalW = ios.w + and.w + gap;
const x0 = Math.round((W - totalW) / 2);
const iosX = x0, andX = x0 + ios.w + gap;

// App icon (the porcelain store icon) with an iOS-style rounded mask.
const ICON = 84;
const iconMask = Buffer.from(`<svg width="${ICON}" height="${ICON}"><rect width="${ICON}" height="${ICON}" rx="${ICON * 0.225}" fill="#fff"/></svg>`);
const icon = await sharp('/Users/sshaji/Documents/Projects/flyRight/assets/images/icon.png').resize(ICON, ICON).composite([{ input: iconMask, blend: 'dest-in' }]).png().toBuffer();

const APPLE = 'M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z';

const badge = (cx, y, kind) => {
  const label = kind === 'ios' ? 'App Store' : 'Google Play';
  const bw = kind === 'ios' ? 214 : 236, bh = 56;
  const x = cx - bw / 2;
  const glyph = kind === 'ios'
    ? `<g transform="translate(${x + 22} ${y + 13}) scale(0.036)"><path d="${APPLE}" fill="${WHITE}"/></g>`
    : `<g transform="translate(${x + 20} ${y + 13}) scale(0.058)">
        <path d="M48 40 L300 256 L48 472 Q40 480 40 460 L40 52 Q40 32 48 40 Z" fill="#00A0FF"/>
        <path d="M48 40 L300 256 L395 161 L80 30 Q56 20 48 40 Z" fill="#00F076"/>
        <path d="M48 472 L300 256 L395 351 L80 482 Q56 492 48 472 Z" fill="#FF3A44"/>
        <path d="M395 161 L300 256 L395 351 L470 310 Q500 292 500 256 Q500 220 470 202 Z" fill="#FFC900"/>
      </g>`;
  return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${WHITE}" fill-opacity="0.08" stroke="${WHITE}" stroke-opacity="0.22"/>
    ${glyph}
    <text x="${x + 62}" y="${y + 37}" font-family="${FONT}" font-size="24" font-weight="600" fill="${WHITE}">${label}</text>`;
};

const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="${night.bottom}"/>
      <stop offset="0.55" stop-color="${night.mid}"/>
      <stop offset="1" stop-color="${night.top}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <path d="M -60 ${H * 0.86} Q ${W * 0.4} ${H * 0.02} ${W + 60} ${H * 0.42}"
    fill="none" stroke="${WHITE}" stroke-opacity="0.07" stroke-width="4"
    stroke-dasharray="0.5 22" stroke-linecap="round"/>
  <text x="${64 + ICON + 22}" y="${64 + ICON / 2 + 15}" font-family="${FONT}" font-size="42" font-weight="700" fill="${WHITE}" letter-spacing="-0.5">FlyRight</text>
  <text x="${W - 64}" y="${64 + ICON / 2 + 10}" text-anchor="end" font-family="${FONT}" font-size="24" fill="${WHITE}" fill-opacity="0.6">getflyright.com</text>
  <text x="64" y="215" font-family="${FONT}" font-size="54" font-weight="700" fill="${WHITE}" letter-spacing="-1.2">${CFG.line1}</text>
  <text x="64" y="277" font-family="${FONT}" font-size="54" font-weight="700" fill="${GREEN}" letter-spacing="-1.2">${CFG.line2}</text>
  ${badge(iosX + ios.w / 2, TOP - 78, 'ios')}
  ${badge(andX + and.w / 2, TOP - 78, 'android')}
</svg>`;

const shadow = (w, h) => sharp(Buffer.from(`<svg width="${w + 160}" height="${h + 160}"><rect x="80" y="100" width="${w}" height="${h}" rx="60" fill="#000" fill-opacity="0.55"/></svg>`)).blur(28).png().toBuffer();

await sharp(Buffer.from(bg), { density: 72 }).composite([
  { input: icon, left: 64, top: 64 },
  { input: await shadow(ios.w, ios.h), left: iosX - 80, top: TOP - 80 },
  { input: await shadow(and.w, and.h), left: andX - 80, top: TOP - 80 },
  { input: ios.buf, left: iosX, top: TOP },
  { input: and.buf, left: andX, top: TOP },
]).png().toFile(OUT);
console.log('wrote', OUT, { iosX, andX, iosW: ios.w, andW: and.w, bottom: TOP + ios.h });
