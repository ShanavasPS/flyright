import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import sharp from 'sharp';
import QRCode from 'qrcode';

// One iPhone screen recording of the World share poster, played at 1× from
// start to end, in the globe/Detour frame: header, one phone on the left, and
// on the right the three steps the clip walks through, each lit while it is
// on screen. The only change to the footage: the share sheet's contact row
// (real people's photos and names) is box-blurred from the first frame the
// sheet appears. Source: Shanavas's Control Center recording (1180 × 2556,
// 60 fps), copied to demo/out/heat/source.mov.
const out = resolve('demo/out/heat');
const work = `${out}/work`;
await mkdir(work, { recursive: true });
const duration = 17.19;
const phone = { x: 84, y: 262, width: 416, height: 900, radius: 60 };
// Seconds read off a 1 fps contact sheet of the source.
const beats = [
  { from: 0, to: 5, title: 'Heat on the GPU', lines: ['A TypeGPU compute shader sums every', 'route\u2019s glow, per pixel.'] },
  { from: 5, to: 14.9, title: 'Two themes, two shapes', lines: ['Dark or light, story or square:', 'one field, recoloured per theme.'] },
  { from: 14.9, to: duration, title: 'One tap to share', lines: ['react-native-view-shot captures it,', 'expo-sharing hands it to iOS.'] },
];
// Share sheet contact row, in source pixels. The sheet animates in from
// 15.43 s and settles by ~15.7 s: a taller band while it grows, then the row.
const blurs = [
  { from: 15.38, to: 15.72, x: 45, y: 1330, w: 1090, h: 540 },
  { from: 15.72, to: 99, x: 45, y: 1330, w: 1090, h: 380 },
];
const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const font = 'Helvetica Neue,Helvetica,Arial,sans-serif';
const icon = await sharp('assets/images/icon.png').resize(64, 64).png().toBuffer();
const appStore = await sharp(new URL('../sharing-demo/assets/app-store.svg', import.meta.url).pathname, { density: 288 }).resize({ height: 44 }).png().toBuffer();
const googlePlay = await sharp(new URL('../sharing-demo/assets/google-play.png', import.meta.url).pathname).trim().resize({ height: 44 }).png().toBuffer();
const googlePlayMeta = await sharp(googlePlay).metadata();
const qr = await QRCode.toBuffer('https://flyright.godetour.link/0tItTZgtyO', { errorCorrectionLevel: 'M', margin: 3, scale: 4 });
const qrMeta = await sharp(qr).metadata();

const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${phone.width}" height="${phone.height}"><rect width="100%" height="100%" fill="black"/><rect width="100%" height="100%" rx="${phone.radius}" fill="white"/></svg>`;
await sharp(Buffer.from(mask)).removeAlpha().png().toFile(`${work}/mask.png`);

// The whole take in one piece, resized to the screen, 30 fps, no audio.
const blur = blurs.map((b, i) => `[b${i}]crop=${b.w}:${b.h}:${b.x}:${b.y},boxblur=36:4[k${i}]`).join(';');
const place = blurs.map((b, i) => `[v${i}][k${i}]overlay=${b.x}:${b.y}:enable='between(t,${b.from},${b.to})'[v${i + 1}]`).join(';');
ff(['-i', `${out}/source.mov`, '-t', String(duration), '-filter_complex',
  `[0:v]split=${blurs.length + 1}[v0]${blurs.map((_, i) => `[b${i}]`).join('')};${blur};${place};` +
  `[v${blurs.length}]fps=30,scale=${phone.width}:${phone.height}:flags=lanczos,setsar=1,format=yuv420p[o]`,
  '-map', '[o]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', `${work}/phone.mp4`]);

// Right column: one PNG per beat with that beat lit and the others dimmed.
const col = { x: 560, y: 470, gap: 190 };
const column = active => `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
  <g font-family="${font}">
  ${beats.map((b, i) => {
    const y = col.y + i * col.gap, on = i === active;
    return `<g opacity="${on ? 1 : 0.38}">
      <rect x="${col.x}" y="${y - 44}" width="6" height="${on ? 128 : 116}" rx="3" fill="${on ? '#3DDC97' : '#4A6384'}"/>
      <text x="${col.x + 30}" y="${y}" font-size="34" font-weight="700" fill="#F1F6FF" letter-spacing="-0.6">${esc(b.title)}</text>
      ${b.lines.map((l, j) => `<text x="${col.x + 30}" y="${y + 38 + j * 30}" font-size="22" fill="#B5C6DC">${esc(l)}</text>`).join('')}
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
    <text x="1028" y="82" text-anchor="end" fill="#A6C3E3" font-size="17" letter-spacing="2">INSIDE THE APP · iPHONE 15 PRO</text>
    <text x="52" y="178" font-size="40" font-weight="700" letter-spacing="-1.2">A GPU heat map on your travel poster.</text>
    <text x="52" y="216" font-size="22" fill="#A9BBD2">TypeGPU by Software Mansion · react-native-webgpu · expo-sharing by Expo</text>
    <rect x="${col.x}" y="${col.y - 150}" width="230" height="46" rx="23" fill="#3DDC97" fill-opacity=".14" stroke="#3DDC97" stroke-opacity=".55"/>
    <text x="${col.x + 115}" y="${col.y - 119}" text-anchor="middle" font-size="19" font-weight="700" fill="#3DDC97" letter-spacing="1.5">HOW IT\u2019S MADE</text>
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

// Compose: background, masked phone, then the lit column for each beat.
const loop = p => ['-loop', '1', '-framerate', '30', '-i', p];
const inputs = [...loop(`${work}/bg.png`), '-i', `${work}/phone.mp4`, ...loop(`${work}/mask.png`), ...beats.flatMap((_, i) => loop(`${work}/col-${i}.png`))];
let filter = `[2:v]format=gray[m];[1:v]format=rgba[p];[p][m]alphamerge[P];[0:v][P]overlay=${phone.x}:${phone.y}:shortest=1[s0]`;
beats.forEach((b, i) => {
  filter += `;[s${i}][${3 + i}:v]overlay=0:0:enable='between(t,${b.from},${b.to - 0.001})'[s${i + 1}]`;
});
filter += `;[s${beats.length}]format=yuv420p[o]`;
ff([...inputs, '-filter_complex', filter, '-map', '[o]', '-t', String(duration), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-movflags', '+faststart', `${out}/flyright-heat.mp4`]);
ff(['-ss', '1.3', '-i', `${out}/flyright-heat.mp4`, '-frames:v', '1', `${out}/flyright-heat-cover.png`]);
console.log(`Exported ${duration}s to ${out}/flyright-heat.mp4`);
