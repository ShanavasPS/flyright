/**
 * The "Maja's day" left panel — a second look for the story cut, in the
 * language of the globe and Detour posts: a fixed thesis at the top, a
 * numbered scene index with its accent rule, the scene's headline and body,
 * a caption strip for the narration, and a footer with the QR code, the
 * store badges and the site. A flight-progress track under the header
 * carries a plane from HEL to HND as the film plays.
 *
 * Selected with DEMO_STYLE=story. render.mjs asks this module for the
 * background of each scene, the caption style and the moving overlays; it
 * never changes the footage or the voice.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

// Colours from the design system (src/constants/theme.ts via tokens.json).
const C = {
  page: '#070f20', ink: '#0c1b36', navy: '#16345f', navyDeep: '#0b1d3e', navyLift: '#2e5c9e',
  text: '#f2f6fb', body: '#bac9dd', muted: '#8fa2bb', silver: '#a9b8ce', tint: '#4e9bf5', hairline: '#1b2c4a',
};
const DISPLAY = 'SF Pro Display, Helvetica Neue, Helvetica, Arial, sans-serif';
const TEXT = 'SF Pro Text, Helvetica Neue, Helvetica, Arial, sans-serif';
const DOWNLOAD_URL = 'https://flyright.godetour.link/0tItTZgtyO';

const THESIS = "Maja's day, on FlyRight.";
const THESIS_SUB = 'Helsinki → Tokyo on AY73. The whole day, in one app.';
const META = 'iPhone 18 Pro · iOS 27 · Expo SDK 57';

// Layout, in the 1920 × 1080 frame. The phone keeps its place on the right.
const L = {
  x0: 96, x1: 1250,
  header: { icon: 60, iconY: 58, wordmark: 102, meta: 98 },
  // The route row: a flag on the outer side of each airport code, the track between.
  track: { y: 160, x0: 194, x1: 1152 },
  thesis: { y: 250, sub: 296 },
  rule: { y: 362 }, index: { y: 412 },
  headline: { y: 490, step: 66, size: 60 },
  body: { y: 630, step: 42, size: 28 },
  extras: { y: 738, size: 56 },
  caption: { y: 852, h: 104 },
  footer: { qr: 976, qrSize: 84, y: 1000 },
};

const xml = (t) => String(t).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const dataUri = (buf) => `data:image/png;base64,${buf.toString('base64')}`;

const icon = await sharp(join(ROOT, 'assets/images/icon.png')).resize(L.header.icon, L.header.icon).png().toBuffer();
const qr = await sharp(await QRCode.toBuffer(DOWNLOAD_URL, { errorCorrectionLevel: 'M', margin: 2, scale: 4 }))
  .resize(L.footer.qrSize, L.footer.qrSize, { kernel: 'nearest' }).png().toBuffer();
const appStore = await sharp(join(HERE, 'brand/badge-app-store.png')).resize({ height: 48 }).png().toBuffer();
const appStoreMeta = await sharp(appStore).metadata();
const googlePlay = await sharp(join(HERE, 'brand/badge-google-play.png')).resize({ height: 48 }).png().toBuffer();
const googlePlayMeta = await sharp(googlePlay).metadata();
const imageCache = new Map();
async function image(src, size) {
  const key = `${src}@${size}`;
  if (!imageCache.has(key)) {
    const buf = await sharp(join(HERE, src)).resize(size, size, { fit: 'cover' }).png().toBuffer();
    imageCache.set(key, buf);
  }
  return imageCache.get(key);
}

/**
 * The route row's ends: Finland's flag, HEL … HND, Japan's flag — each flag
 * on the outer side of its code, at true proportions (18:11 and 3:2) and a
 * shared 16 px height, centred on the track line with a hairline edge so the
 * white fields don't blur into the silver text.
 */
function routeEnds() {
  const h = 16, y = L.track.y - h / 2, gap = 10;
  const fiW = 26, jpW = 24;
  const fi = `<svg x="${L.x0}" y="${y}" width="${fiW}" height="${h}" viewBox="0 0 18 11" preserveAspectRatio="none">
      <rect width="18" height="11" fill="#FFFFFF"/><rect x="5" width="3" height="11" fill="#002F6C"/><rect y="4" width="18" height="3" fill="#002F6C"/></svg>`;
  const jpX = L.x1 - jpW;
  const jp = `<svg x="${jpX}" y="${y}" width="${jpW}" height="${h}" viewBox="0 0 3 2">
      <rect width="3" height="2" fill="#FFFFFF"/><circle cx="1.5" cy="1" r=".6" fill="#BC002D"/></svg>`;
  const edge = (x, w) => `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="3" fill="none" stroke="${C.silver}" stroke-opacity=".45" stroke-width="1"/>`;
  const clip = (id, x, w) => `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/></clipPath>`;
  return `<defs>${clip('flag-fi', L.x0, fiW)}${clip('flag-jp', jpX, jpW)}</defs>
      <g clip-path="url(#flag-fi)">${fi}</g>${edge(L.x0, fiW)}
      <text x="${L.x0 + fiW + gap}" y="${L.track.y + 6}" font-size="16" font-weight="700" letter-spacing="1.5" fill="${C.silver}">HEL</text>
      <g clip-path="url(#flag-jp)">${jp}</g>${edge(jpX, jpW)}
      <text x="${jpX - gap}" y="${L.track.y + 6}" text-anchor="end" font-size="16" font-weight="700" letter-spacing="1.5" fill="${C.silver}">HND</text>`;
}

/** The phone enclosure, unchanged from the first cut so the footage sits exactly where it did. */
function enclosure(phone) {
  return `
    <rect x="${phone.x - 16}" y="${phone.y - 7}" width="${phone.width + 32}" height="${phone.height + 24}" rx="77" fill="#020812" fill-opacity=".28"/>
    <g fill="url(#metal)" stroke="#0E1620" stroke-width="1">
      <rect x="${phone.x - 17}" y="196" width="7" height="32" rx="3"/>
      <rect x="${phone.x - 17}" y="255" width="7" height="65" rx="3"/>
      <rect x="${phone.x - 17}" y="337" width="7" height="65" rx="3"/>
      <rect x="${phone.x + phone.width + 10}" y="289" width="7" height="98" rx="3"/>
      <rect x="${phone.x + phone.width + 10}" y="724" width="6" height="62" rx="3"/>
      <rect x="${phone.x - phone.bezel}" y="${phone.y - phone.bezel}" width="${phone.width + phone.bezel * 2}" height="${phone.height + phone.bezel * 2}" rx="${phone.radius + phone.bezel}"/>
    </g>
    <rect x="${phone.x - 9}" y="${phone.y - 9}" width="${phone.width + 18}" height="${phone.height + 18}" rx="${phone.radius + 9}" fill="#050608" stroke="#AFB8C0" stroke-opacity=".35" stroke-width="1"/>`;
}

/**
 * DEMO_MOVIE=1: the panel gives its middle to a film window (the generated
 * clip of Maja's day) and keeps one headline line under it. The thesis,
 * body and picture rows go; the RevenueCat mark and a scene's note sit at
 * the right end of the index line.
 */
export const MOVIE = process.env.DEMO_MOVIE === '1';
export const WINDOW = { x: L.x0, y: 200, width: L.x1 - L.x0, height: 500, radius: 24 };
export function movieWindowMask() {
  return `<svg width="${WINDOW.width}" height="${WINDOW.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="black"/><rect width="100%" height="100%" rx="${WINDOW.radius}" fill="white"/></svg>`;
}

export async function background(args) {
  return MOVIE ? movieBackground(args) : storyBackground(args);
}

async function movieBackground({ scene, index, scenes, start, total, phone }) {
  const chapter = `${String(index + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')} · ${scene.chapter}`;
  const headline = scene.headline.join(' ');
  let right = '';
  if (scene.images?.some((im) => im.src.includes('revenuecat'))) {
    const buf = await image('brand/revenuecat-mark.png', 30);
    right = `<clipPath id="rc"><rect x="${L.x1 - 30}" y="${W_INDEX - 22}" width="30" height="30" rx="7"/></clipPath>
      <image href="${dataUri(buf)}" x="${L.x1 - 30}" y="${W_INDEX - 22}" width="30" height="30" clip-path="url(#rc)"/>
      <text x="${L.x1 - 42}" y="${W_INDEX}" text-anchor="end" font-family="${TEXT}" font-size="18" font-weight="600" fill="${C.text}">RevenueCat</text>`;
  } else if (scene.note) {
    right = `<text x="${L.x1}" y="${W_INDEX}" text-anchor="end" font-family="${TEXT}" font-size="16" font-weight="500" fill="${C.muted}">${xml(scene.note)}</text>`;
  }
  const span = L.track.x1 - L.track.x0;
  let at = 0;
  const ticks = scenes.map((s, i) => {
    const x = L.track.x0 + (at / total) * span;
    at += s.duration;
    return `<rect x="${x - (i === index ? 2 : 1)}" y="${L.track.y - (i === index ? 9 : 5)}" width="${i === index ? 4 : 2}" height="${i === index ? 18 : 10}" rx="1" fill="${i === index ? C.tint : C.silver}" fill-opacity="${i === index ? 1 : 0.45}"/>`;
  }).join('');
  return `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sky" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${C.page}"/><stop offset=".55" stop-color="${C.ink}"/><stop offset="1" stop-color="${C.navy}"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="${C.navyLift}" stop-opacity=".34"/><stop offset="1" stop-color="${C.navyLift}" stop-opacity="0"/></radialGradient>
      <linearGradient id="metal" x1="0" y1="0" x2="1" y2=".4"><stop stop-color="#81909C"/><stop offset=".13" stop-color="#303B46"/><stop offset=".6" stop-color="#111820"/><stop offset="1" stop-color="#697583"/></linearGradient>
    </defs>
    <rect width="1920" height="1080" fill="url(#sky)"/>
    <ellipse cx="1515" cy="520" rx="640" ry="720" fill="url(#glow)"/>
    <circle cx="1560" cy="540" r="700" fill="none" stroke="#71B7FB" stroke-opacity=".06" stroke-width="2" stroke-dasharray="4 13"/>
    <circle cx="1560" cy="540" r="860" fill="none" stroke="#71B7FB" stroke-opacity=".045" stroke-width="2" stroke-dasharray="4 13"/>
    <g font-family="${TEXT}" fill="${C.text}">
      <image href="${dataUri(icon)}" x="${L.x0}" y="${L.header.iconY}" width="${L.header.icon}" height="${L.header.icon}"/>
      <text x="${L.x0 + L.header.icon + 18}" y="${L.header.wordmark}" font-family="${DISPLAY}" font-size="36" font-weight="700">FlyRight</text>
      <text x="${L.x1}" y="${L.header.meta}" text-anchor="end" font-size="16" font-weight="600" letter-spacing="2.5" fill="${C.silver}">SHIPATON 2026 · MAJA'S DAY</text>
      ${routeEnds()}
      <line x1="${L.track.x0}" y1="${L.track.y}" x2="${L.track.x1}" y2="${L.track.y}" stroke="${C.silver}" stroke-opacity=".28" stroke-width="2" stroke-dasharray="3 9"/>
      ${ticks}

      <rect x="${WINDOW.x}" y="${WINDOW.y}" width="${WINDOW.width}" height="${WINDOW.height}" rx="${WINDOW.radius}" fill="${C.page}" stroke="${C.hairline}" stroke-width="1"/>

      <rect x="${L.x0}" y="${W_INDEX - 44}" width="64" height="5" rx="2.5" fill="${C.tint}"/>
      <text x="${L.x0}" y="${W_INDEX}" font-size="18" font-weight="600" letter-spacing="3" fill="${C.tint}">${xml(chapter)}</text>
      ${right}
      <text x="${L.x0}" y="${W_HEADLINE}" font-family="${DISPLAY}" font-size="46" font-weight="700" letter-spacing="-1.5">${xml(headline)}</text>

      <rect x="${L.x0}" y="${L.caption.y}" width="${L.x1 - L.x0}" height="${L.caption.h}" rx="16" fill="${C.page}" fill-opacity=".55" stroke="${C.hairline}" stroke-width="1"/>
      <image href="${dataUri(qr)}" x="${L.x0}" y="${L.footer.qr}" width="${L.footer.qrSize}" height="${L.footer.qrSize}"/>
      <text x="${L.x0 + L.footer.qrSize + 22}" y="${L.footer.y + 6}" font-size="22" font-weight="600">Scan to get FlyRight</text>
      <text x="${L.x0 + L.footer.qrSize + 22}" y="${L.footer.y + 38}" font-size="18" font-weight="500" fill="${C.muted}">Free on the App Store and Google Play</text>
      <image href="${dataUri(appStore)}" x="640" y="${L.footer.y - 6}" width="${appStoreMeta.width}" height="48"/>
      <image href="${dataUri(googlePlay)}" x="${640 + appStoreMeta.width + 16}" y="${L.footer.y - 6}" width="${googlePlayMeta.width}" height="48"/>
      <text x="${L.x1}" y="${L.footer.y + 6}" text-anchor="end" font-size="22" font-weight="600">getflyright.com</text>
      <text x="${L.x1}" y="${L.footer.y + 38}" text-anchor="end" font-size="15" font-weight="500" fill="${C.silver}">${xml(META)}</text>
      ${enclosure(phone)}
    </g>
  </svg>`;
}
const W_INDEX = 760, W_HEADLINE = 818;

async function storyBackground({ scene, index, scenes, start, total, phone }) {
  const isClose = index === scenes.length - 1;
  const chapter = `${String(index + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')} · ${scene.chapter}`;
  const headline = scene.headline.map((line, i) =>
    `<text x="${L.x0}" y="${L.headline.y + i * L.headline.step}" font-family="${DISPLAY}" font-size="${L.headline.size}" font-weight="700" letter-spacing="-2" fill="${C.text}">${xml(line)}</text>`).join('');
  const body = scene.bullets.map((line, i) => {
    const link = /\.\w{2,}$/.test(line) && !line.includes(' ');
    return `<text x="${L.x0}" y="${L.body.y + i * L.body.step}" font-family="${TEXT}" font-size="${L.body.size}" font-weight="${link ? 600 : 500}" fill="${link ? C.tint : C.body}">${xml(line)}</text>`;
  }).join('');

  // A scene's picture and its label sit on one row: Maja on the first scene,
  // the RevenueCat mark on the Pro scenes. The close keeps only its headline;
  // the footer already carries the icon, the badges and the site.
  let extras = '';
  if (!isClose && scene.images?.length) {
    const size = L.extras.size;
    const im = scene.images[0];
    const buf = await image(im.src, size);
    const round = im.src.includes('avatar') ? size / 2 : 12;
    extras += `<clipPath id="extra"><rect x="${L.x0}" y="${L.extras.y}" width="${size}" height="${size}" rx="${round}"/></clipPath>
      <image href="${dataUri(buf)}" x="${L.x0}" y="${L.extras.y}" width="${size}" height="${size}" clip-path="url(#extra)"/>`;
    const label = scene.labels?.[0];
    if (label) extras += `<text x="${L.x0 + size + 20}" y="${L.extras.y + 37}" font-family="${TEXT}" font-size="26" font-weight="600" fill="${C.text}">${xml(label.text)}</text>`;
  }
  // The note hangs from whatever sits above it: the picture row, else the body.
  const noteY = !isClose && scene.images?.length ? L.extras.y + L.extras.size + 36 : L.body.y + scene.bullets.length * L.body.step + 14;
  if (scene.note) extras += `<text x="${L.x0}" y="${noteY}" font-family="${TEXT}" font-size="19" font-weight="500" fill="${C.muted}">${xml(scene.note)}</text>`;

  // The flight-progress track: one tick per scene, the current one lit. The
  // plane itself is an overlay in the render so it can move within a scene.
  const span = L.track.x1 - L.track.x0;
  let at = 0;
  const ticks = scenes.map((s, i) => {
    const x = L.track.x0 + (at / total) * span;
    at += s.duration;
    return `<rect x="${x - (i === index ? 2 : 1)}" y="${L.track.y - (i === index ? 9 : 5)}" width="${i === index ? 4 : 2}" height="${i === index ? 18 : 10}" rx="1" fill="${i === index ? C.tint : C.silver}" fill-opacity="${i === index ? 1 : 0.45}"/>`;
  }).join('');

  return `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sky" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${C.page}"/><stop offset=".55" stop-color="${C.ink}"/><stop offset="1" stop-color="${C.navy}"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="${C.navyLift}" stop-opacity=".34"/><stop offset="1" stop-color="${C.navyLift}" stop-opacity="0"/></radialGradient>
      <linearGradient id="metal" x1="0" y1="0" x2="1" y2=".4"><stop stop-color="#81909C"/><stop offset=".13" stop-color="#303B46"/><stop offset=".6" stop-color="#111820"/><stop offset="1" stop-color="#697583"/></linearGradient>
    </defs>
    <rect width="1920" height="1080" fill="url(#sky)"/>
    <ellipse cx="1515" cy="520" rx="640" ry="720" fill="url(#glow)"/>
    <circle cx="1560" cy="540" r="700" fill="none" stroke="#71B7FB" stroke-opacity=".06" stroke-width="2" stroke-dasharray="4 13"/>
    <circle cx="1560" cy="540" r="860" fill="none" stroke="#71B7FB" stroke-opacity=".045" stroke-width="2" stroke-dasharray="4 13"/>
    <g font-family="${TEXT}" fill="${C.text}">
      <image href="${dataUri(icon)}" x="${L.x0}" y="${L.header.iconY}" width="${L.header.icon}" height="${L.header.icon}"/>
      <text x="${L.x0 + L.header.icon + 18}" y="${L.header.wordmark}" font-family="${DISPLAY}" font-size="36" font-weight="700">FlyRight</text>
      <text x="${L.x1}" y="${L.header.meta}" text-anchor="end" font-size="16" font-weight="600" letter-spacing="2.5" fill="${C.silver}">SHIPATON 2026 · INSIDE THE APP</text>

      ${routeEnds()}
      <line x1="${L.track.x0}" y1="${L.track.y}" x2="${L.track.x1}" y2="${L.track.y}" stroke="${C.silver}" stroke-opacity=".28" stroke-width="2" stroke-dasharray="3 9"/>
      ${ticks}

      <text x="${L.x0}" y="${L.thesis.y}" font-family="${DISPLAY}" font-size="46" font-weight="700" letter-spacing="-1.5">${xml(THESIS)}</text>
      <text x="${L.x0}" y="${L.thesis.sub}" font-size="24" font-weight="500" fill="${C.muted}">${xml(THESIS_SUB)}</text>

      <rect x="${L.x0}" y="${L.rule.y}" width="64" height="5" rx="2.5" fill="${C.tint}"/>
      <text x="${L.x0}" y="${L.index.y}" font-size="18" font-weight="600" letter-spacing="3" fill="${C.tint}">${xml(chapter)}</text>
      ${headline}
      ${body}
      ${extras}

      <rect x="${L.x0}" y="${L.caption.y}" width="${L.x1 - L.x0}" height="${L.caption.h}" rx="16" fill="${C.page}" fill-opacity=".55" stroke="${C.hairline}" stroke-width="1"/>

      <image href="${dataUri(qr)}" x="${L.x0}" y="${L.footer.qr}" width="${L.footer.qrSize}" height="${L.footer.qrSize}"/>
      <text x="${L.x0 + L.footer.qrSize + 22}" y="${L.footer.y + 6}" font-size="22" font-weight="600">Scan to get FlyRight</text>
      <text x="${L.x0 + L.footer.qrSize + 22}" y="${L.footer.y + 38}" font-size="18" font-weight="500" fill="${C.muted}">Free on the App Store and Google Play</text>
      <image href="${dataUri(appStore)}" x="640" y="${L.footer.y - 6}" width="${appStoreMeta.width}" height="48"/>
      <image href="${dataUri(googlePlay)}" x="${640 + appStoreMeta.width + 16}" y="${L.footer.y - 6}" width="${googlePlayMeta.width}" height="48"/>
      <text x="${L.x1}" y="${L.footer.y + 6}" text-anchor="end" font-size="22" font-weight="600">getflyright.com</text>
      <text x="${L.x1}" y="${L.footer.y + 38}" text-anchor="end" font-size="15" font-weight="500" fill="${C.silver}">${xml(META)}</text>
      ${enclosure(phone)}
    </g>
  </svg>`;
}

/** Captions read inside the strip, two lines at most, SF Pro like the app. */
export const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,SF Pro Text,30,&H00FBF6F2,&H00FBF6F2,&H00200F07,&H00200F07,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
export const captionTag = `{\\an7\\pos(${L.x0 + 24},${L.caption.y + 18})\\fad(90,90)}`;

/**
 * The plane on the progress track, with its flown line, as one continuous
 * clip laid over the finished film. Overlays sit on whole pixels, and at
 * about nine pixels a second the plane would hop a pixel every third frame;
 * here every frame is drawn as SVG at its fractional position, so the
 * motion is anti-aliased and even. The clip is an RGBA PNG-in-MOV of the
 * track's strip; render.mjs places it at {x, y} on the final assembly.
 */
export async function trackStrip({ total, fps, out, ffmpeg = 'ffmpeg' }) {
  const size = 32;
  const y0 = L.track.y - 20, height = 40;
  const x0 = L.x0, width = L.x1 - L.x0;
  const span = L.track.x1 - L.track.x0;
  const local = L.track.x0 - x0;
  const path = join(out, 'graphics', 'track-strip.mov');
  const frames = Math.ceil(total * fps);
  const glyph = 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';
  const { spawn } = await import('node:child_process');
  const enc = spawn(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-framerate', String(fps), '-i', 'pipe:0', '-c:v', 'png', '-pix_fmt', 'rgba', path], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => { enc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`track strip encode failed (${code})`)))); enc.on('error', reject); });
  for (let f = 0; f < frames; f++) {
    const progress = Math.min(1, f / fps / total);
    const px = local + progress * span;
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${local}" y="${20 - 2}" width="${(progress * span).toFixed(3)}" height="4" rx="2" fill="${C.tint}" fill-opacity=".92"/>
      <g transform="translate(${(px - size / 2).toFixed(3)} ${20 - size / 2}) scale(${size / 24}) rotate(90 12 12)">
        <path d="${glyph}" fill="${C.ink}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
        <path d="${glyph}" fill="${C.text}"/>
      </g>
    </svg>`;
    const raw = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
    if (!enc.stdin.write(raw)) await new Promise((r) => enc.stdin.once('drain', r));
  }
  enc.stdin.end();
  await done;
  return { path, x: x0, y: y0, frames };
}

/** Per-scene overlays are no longer needed: the strip above carries the plane. */
export async function overlays() {
  return [];
}
