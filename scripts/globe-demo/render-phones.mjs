import { mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import sharp from 'sharp';
import QRCode from 'qrcode';

// Two iPhone screen recordings side by side, 1080 × 1350: the dark-mode take
// on the left, the light-mode take on the right, both playing continuously
// at 1× from their own in-point for the same duration. No captions — the
// bottom band carries the download QR and store badges; the footage never cuts. Recordings are the
// phone's own Control Center screen recordings (1180 × 2556, 60 fps).
const out = resolve('demo/out/globe');
const work = `${out}/work-phones`;
await mkdir(work, { recursive: true });
const edit = JSON.parse(await readFile(new URL('./edit-phones.json', import.meta.url), 'utf8'));
// No mode labels above the phones — the footage says it — so they sit higher
// and the QR below has room.
const phone = { width: 410, height: 888, radius: 50, y: 252 };
const sides = { left: { x: 62, ...edit.left }, right: { x: 608, ...edit.right } };
const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const icon = await sharp('assets/images/icon.png').resize(64, 64).png().toBuffer();
const appStore = await sharp(new URL('../sharing-demo/assets/app-store.svg', import.meta.url).pathname, { density: 288 }).resize({ height: 44 }).png().toBuffer();
const googlePlay = await sharp(new URL('../sharing-demo/assets/google-play.png', import.meta.url).pathname).trim().resize({ height: 44 }).png().toBuffer();
const googlePlayMeta = await sharp(googlePlay).metadata();
// Bottom band: the download QR on the left, badges on the right — no captions.
const qr = await QRCode.toBuffer('https://flyright.godetour.link/0tItTZgtyO', { errorCorrectionLevel: 'M', margin: 3, scale: 4 });
const qrMeta = await sharp(qr).metadata();

const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${phone.width}" height="${phone.height}"><rect width="100%" height="100%" fill="black"/><rect width="100%" height="100%" rx="${phone.radius}" fill="white"/></svg>`;
await sharp(Buffer.from(mask)).removeAlpha().png().toFile(`${work}/mask.png`);

// One trimmed, resized, 30 fps clip per side — the whole take in one piece.
for (const [side, s] of Object.entries(sides)) {
  ff(['-ss', String(s.start), '-t', String(edit.duration), '-i', `${out}/${s.clip}`,
    '-vf', `fps=30,scale=${phone.width}:${phone.height}:flags=lanczos,setsar=1,format=yuv420p`,
    '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', `${work}/${side}.mp4`]);
}

// Static background: header, phone bezels, credits. Captions are separate
// PNGs overlaid for their interval.
const background = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
  <defs><linearGradient id="bg" x1="0" x2="1" y1="1" y2="0"><stop stop-color="#050D1C"/><stop offset="1" stop-color="#142C4C"/></linearGradient><linearGradient id="edge"><stop stop-color="#657589"/><stop offset=".3" stop-color="#202C3B"/><stop offset="1" stop-color="#536477"/></linearGradient></defs>
  <rect width="1080" height="1350" fill="url(#bg)"/>
  <circle cx="540" cy="740" r="640" fill="none" stroke="#71B7FB" stroke-opacity=".06" stroke-width="2" stroke-dasharray="4 13"/>
  <image href="data:image/png;base64,${icon.toString('base64')}" x="52" y="44" width="64" height="64"/>
  <g font-family="Helvetica Neue,Helvetica,Arial,sans-serif" fill="#F1F6FF">
    <text x="132" y="87" font-size="35" font-weight="700">FlyRight</text>
    <text x="1028" y="82" text-anchor="end" fill="#A6C3E3" font-size="17" letter-spacing="2">INSIDE THE APP · iPHONE 15 PRO</text>
    <text x="52" y="178" font-size="40" font-weight="700" letter-spacing="-1.2">The map is a globe now. One shader, no map SDK.</text>
    <text x="52" y="216" font-size="22" fill="#A9BBD2">react-native-skia by Shopify · Reanimated + Gesture Handler by Software Mansion</text>
    ${Object.values(sides).map(s => `
      <rect x="${s.x - 9}" y="${phone.y - 9}" width="${phone.width + 18}" height="${phone.height + 18}" rx="${phone.radius + 9}" fill="url(#edge)"/>
      <rect x="${s.x - 4}" y="${phone.y - 4}" width="${phone.width + 8}" height="${phone.height + 8}" rx="${phone.radius + 4}" fill="#030508"/>
      <rect x="${s.x - 12}" y="${phone.y + 150}" width="4" height="52" rx="2" fill="#485A70"/><rect x="${s.x - 12}" y="${phone.y + 218}" width="4" height="52" rx="2" fill="#485A70"/><rect x="${s.x + phone.width + 8}" y="${phone.y + 180}" width="4" height="80" rx="2" fill="#485A70"/>`).join('')}
    <image href="data:image/png;base64,${qr.toString('base64')}" x="52" y="${1332 - qrMeta.height}" width="${qrMeta.width}" height="${qrMeta.height}"/>
    <text x="${52 + qrMeta.width + 20}" y="1268" font-size="26" font-weight="600">Scan to get FlyRight</text>
    <text x="${52 + qrMeta.width + 20}" y="1302" font-size="20" fill="#BAC9DD">Free on the App Store and Google Play</text>
    <text x="1028" y="1240" text-anchor="end" font-size="20" font-weight="600">getflyright.com</text>
    <image href="data:image/png;base64,${appStore.toString('base64')}" x="${1028 - 132}" y="1262" width="132" height="44"/>
    <image href="data:image/png;base64,${googlePlay.toString('base64')}" x="${1028 - 132 - 16 - googlePlayMeta.width}" y="1262" width="${googlePlayMeta.width}" height="44"/>
  </g>
</svg>`;
await sharp(Buffer.from(background)).png().toFile(`${work}/bg.png`);

// Compose: background, then both masked phone clips.
const inputs = ['-loop', '1', '-framerate', '30', '-i', `${work}/bg.png`, '-i', `${work}/left.mp4`, '-i', `${work}/right.mp4`, '-loop', '1', '-framerate', '30', '-i', `${work}/mask.png`];
const filter = `[3:v]format=gray,split[m1][m2];[1:v]format=rgba[l];[l][m1]alphamerge[L];[2:v]format=rgba[r];[r][m2]alphamerge[R];[0:v][L]overlay=${sides.left.x}:${phone.y}:shortest=1[a];[a][R]overlay=${sides.right.x}:${phone.y},format=yuv420p[o]`;
ff([...inputs, '-filter_complex', filter, '-map', '[o]', '-t', String(edit.duration), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-movflags', '+faststart', `${out}/flyright-globe-phones.mp4`]);
ff(['-ss', '13.5', '-i', `${out}/flyright-globe-phones.mp4`, '-frames:v', '1', `${out}/flyright-globe-phones-cover.png`]);
console.log(`Exported ${edit.duration}s to ${out}/flyright-globe-phones.mp4`);
