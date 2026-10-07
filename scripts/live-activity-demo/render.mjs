// Frames one platform's five beats into the 20-second LinkedIn cut:
// 1080 × 1350, the phone on the left (each beat trimmed to 4.0 s from the
// `cuts` table and concatenated), on the right a five-step column that lights
// up with the beat. `node scripts/live-activity-demo/render.mjs ios|android`.
// Beats live in demo/out/live-activity/<platform>/beat-<n>-<id>.mp4; the cut
// points come from cuts.json in the same folder: { "1": [[start, dur], …], … }
// — a beat is a few jump-cut segments of the take (seconds in the source)
// whose durations add up to BEAT, so a long Maestro hold never reaches the
// cut while every transition (unlock, island expand, shade) does.
import { mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import sharp from 'sharp';
import QRCode from 'qrcode';

const platform = process.argv[2];
if (!['ios', 'android'].includes(platform)) throw new Error('render.mjs ios|android');
const BEAT = 4.0;
const src = resolve(`demo/out/live-activity/${platform}`);
const out = resolve('demo/out/live-activity');
const work = `${src}/work`;
await mkdir(work, { recursive: true });
const cuts = JSON.parse(await readFile(`${src}/cuts.json`, 'utf8'));
const beats = [
  { id: 'departs', title: 'Departs in', lines: ['The clock ticks on the phone.', 'Gate and boarding time beside it.'] },
  { id: 'boarding', title: 'Boarding', lines: ['Boarding opens: the label turns,', 'the gate is the fact that matters.'] },
  { id: 'onboard', title: 'On board', lines: ['Past the gate, your seat', 'takes its place.'] },
  { id: 'air', title: 'Lands in', lines: ['In the air the clock counts', 'to landing; the plane rides the route.'] },
  { id: 'landed', title: 'Landed', lines: ['Touchdown time and the', 'baggage belt, then it retires.'] },
];
const copy = {
  ios: {
    headline: 'Your flight on the Lock Screen. Live.',
    sub: 'ActivityKit · OneSignal Live Activities · Convex · Expo',
    tag: 'iOS 27 · iPHONE 18 PRO SIMULATOR',
  },
  android: {
    headline: 'Your flight in the status bar. Live.',
    sub: 'Android 16 Live Updates · OneSignal · Convex · Expo',
    tag: 'ANDROID 17 · GALAXY S26 ULTRA EMULATOR',
  },
}[platform];
const duration = BEAT * beats.length;
const phone = { x: 84, y: 262, width: 416, height: 900, radius: platform === 'ios' ? 60 : 44 };
const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const font = 'Helvetica Neue,Helvetica,Arial,sans-serif';
const icon = await sharp('assets/images/icon.png').resize(64, 64).png().toBuffer();
const appStore = await sharp(resolve('scripts/sharing-demo/assets/app-store.svg'), { density: 288 }).resize({ height: 44 }).png().toBuffer();
const googlePlay = await sharp(resolve('scripts/sharing-demo/assets/google-play.png')).trim().resize({ height: 44 }).png().toBuffer();
const googlePlayMeta = await sharp(googlePlay).metadata();
const qr = await QRCode.toBuffer('https://flyright.godetour.link/0tItTZgtyO', { errorCorrectionLevel: 'M', margin: 3, scale: 4 });
const qrMeta = await sharp(qr).metadata();

const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${phone.width}" height="${phone.height}"><rect width="100%" height="100%" fill="black"/><rect width="100%" height="100%" rx="${phone.radius}" fill="white"/></svg>`;
await sharp(Buffer.from(mask)).removeAlpha().png().toFile(`${work}/mask.png`);

// Each beat: fps first (recordings only carry changed frames), then the cut,
// scaled to fill the phone slot. Then one clip of them all.
const list = [];
for (const [i, b] of beats.entries()) {
  const segments = cuts[String(i + 1)];
  const total = segments.reduce((sum, [, d]) => sum + d, 0);
  if (Math.abs(total - BEAT) > 0.001) throw new Error(`beat ${i + 1}: segments add up to ${total}s, not ${BEAT}s`);
  const file = `${work}/beat-${i + 1}.mp4`;
  const concat = segments.map((_, k) => `[p${k}]`).join('') + `concat=n=${segments.length}:v=1:a=0`;
  ff(['-i', `${src}/beat-${i + 1}-${b.id}.mp4`, '-filter_complex',
    `[0:v]fps=30,scale=${phone.width}:${phone.height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${phone.width}:${phone.height},setsar=1,split=${segments.length}${segments.map((_, k) => `[v${k}]`).join('')};` +
    segments.map(([start, dur], k) => `[v${k}]trim=start=${start}:end=${start + dur},setpts=PTS-STARTPTS[p${k}]`).join(';') + ';' +
    `${concat},format=yuv420p[o]`,
    '-map', '[o]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-r', '30', file]);
  list.push(`file '${file}'`);
}
await (await import('node:fs/promises')).writeFile(`${work}/list.txt`, list.join('\n'));
ff(['-f', 'concat', '-safe', '0', '-i', `${work}/list.txt`, '-c', 'copy', `${work}/phone.mp4`]);

const col = { x: 560, y: 452, gap: 128 };
const column = active => `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
  <g font-family="${font}">
  ${beats.map((b, i) => {
    const y = col.y + i * col.gap, on = i === active;
    return `<g opacity="${on ? 1 : 0.38}">
      <rect x="${col.x}" y="${y - 34}" width="6" height="${on ? 96 : 86}" rx="3" fill="${on ? '#3DDC97' : '#4A6384'}"/>
      <text x="${col.x + 30}" y="${y}" font-size="32" font-weight="700" fill="#F1F6FF" letter-spacing="-0.6">${esc(b.title)}</text>
      ${b.lines.map((l, j) => `<text x="${col.x + 30}" y="${y + 32 + j * 26}" font-size="20" fill="#B5C6DC">${esc(l)}</text>`).join('')}
    </g>`;
  }).join('')}
  </g></svg>`;
for (const [i] of beats.entries()) await sharp(Buffer.from(column(i))).png().toFile(`${work}/col-${i}.png`);

const background = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
  <defs><linearGradient id="bg" x1="0" x2="1" y1="1" y2="0"><stop stop-color="#050D1C"/><stop offset="1" stop-color="#142C4C"/></linearGradient><linearGradient id="edge"><stop stop-color="#657589"/><stop offset=".3" stop-color="#202C3B"/><stop offset="1" stop-color="#536477"/></linearGradient></defs>
  <rect width="1080" height="1350" fill="url(#bg)"/>
  <circle cx="780" cy="720" r="560" fill="none" stroke="#71B7FB" stroke-opacity=".06" stroke-width="2" stroke-dasharray="4 13"/>
  <image href="data:image/png;base64,${icon.toString('base64')}" x="52" y="44" width="64" height="64"/>
  <g font-family="${font}" fill="#F1F6FF">
    <text x="132" y="87" font-size="35" font-weight="700">FlyRight</text>
    <text x="1028" y="82" text-anchor="end" fill="#A6C3E3" font-size="17" letter-spacing="2">${esc(copy.tag)}</text>
    <text x="52" y="178" font-size="40" font-weight="700" letter-spacing="-1.2">${esc(copy.headline)}</text>
    <text x="52" y="216" font-size="22" fill="#A9BBD2">${esc(copy.sub)}</text>
    <rect x="${col.x}" y="${col.y - 132}" width="230" height="46" rx="23" fill="#3DDC97" fill-opacity=".14" stroke="#3DDC97" stroke-opacity=".55"/>
    <text x="${col.x + 115}" y="${col.y - 101}" text-anchor="middle" font-size="19" font-weight="700" fill="#3DDC97" letter-spacing="1.5">ONE TRAVEL DAY</text>
    <rect x="${phone.x - 9}" y="${phone.y - 9}" width="${phone.width + 18}" height="${phone.height + 18}" rx="${phone.radius + 9}" fill="url(#edge)"/>
    <rect x="${phone.x - 4}" y="${phone.y - 4}" width="${phone.width + 8}" height="${phone.height + 8}" rx="${phone.radius + 4}" fill="#030508"/>
    <rect x="${phone.x - 12}" y="${phone.y + 150}" width="4" height="52" rx="2" fill="#485A70"/><rect x="${phone.x - 12}" y="${phone.y + 218}" width="4" height="52" rx="2" fill="#485A70"/><rect x="${phone.x + phone.width + 8}" y="${phone.y + 180}" width="4" height="80" rx="2" fill="#485A70"/>
    <image href="data:image/png;base64,${qr.toString('base64')}" x="${1028 - qrMeta.width}" y="${1332 - qrMeta.height - 80}" width="${qrMeta.width}" height="${qrMeta.height}"/>
    <text x="${1028 - qrMeta.width - 20}" y="${1332 - 80 - qrMeta.height / 2 - 4}" text-anchor="end" font-size="26" font-weight="600">Scan to get FlyRight</text>
    <text x="${1028 - qrMeta.width - 20}" y="${1332 - 80 - qrMeta.height / 2 + 28}" text-anchor="end" font-size="20" fill="#BAC9DD">getflyright.com</text>
    <image href="data:image/png;base64,${appStore.toString('base64')}" x="${1028 - 132}" y="1262" width="132" height="44"/>
    <image href="data:image/png;base64,${googlePlay.toString('base64')}" x="${1028 - 132 - 16 - googlePlayMeta.width}" y="1262" width="${googlePlayMeta.width}" height="44"/>
  </g>
</svg>`;
await sharp(Buffer.from(background)).png().toFile(`${work}/bg.png`);

const loop = p => ['-loop', '1', '-framerate', '30', '-i', p];
const inputs = [...loop(`${work}/bg.png`), '-i', `${work}/phone.mp4`, ...loop(`${work}/mask.png`), ...beats.flatMap((_, i) => loop(`${work}/col-${i}.png`))];
let filter = `[2:v]format=gray[m];[1:v]format=rgba[p];[p][m]alphamerge[P];[0:v][P]overlay=${phone.x}:${phone.y}:shortest=1[s0]`;
beats.forEach((_, i) => {
  filter += `;[s${i}][${3 + i}:v]overlay=0:0:enable='between(t,${i * BEAT},${(i + 1) * BEAT - 0.001})'[s${i + 1}]`;
});
filter += `;[s${beats.length}]format=yuv420p[o]`;
const target = `${out}/flyright-live-activity-${platform}.mp4`;
ff([...inputs, '-filter_complex', filter, '-map', '[o]', '-t', String(duration), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-movflags', '+faststart', target]);
ff(['-ss', '1.0', '-i', target, '-frames:v', '1', `${out}/flyright-live-activity-${platform}-cover.png`]);
console.log(`Exported ${duration}s to ${target}`);
