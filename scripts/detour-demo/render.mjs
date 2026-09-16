import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import sharp from 'sharp';
import QRCode from 'qrcode';

// 1080 × 1350 feed video: a phone on the right, the story on the left. Scenes
// come from edit.json; each names its source clip, the cut, the device whose
// frame to draw (the sender is an iPhone, the invitee an Android phone) and
// the captions. Same recipe as scripts/sharing-demo/render.mjs.
const out = resolve('demo/out/detour');
await mkdir(`${out}/graphics`, { recursive: true });
await mkdir(`${out}/segments`, { recursive: true });
const scenes = JSON.parse(await readFile(new URL(process.env.EDIT ?? './edit-invitee.json', import.meta.url), 'utf8'));
// Both frames share a top edge and a centre line; the Pixel is a little
// narrower and taller than the iPhone at the same scale.
const frames = {
  ios: { x: 522, y: 172, width: 500, height: 1088, radius: 62 },
  android: { x: 528, y: 172, width: 488, height: 1095, radius: 54 },
};
const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const icon = await sharp('assets/images/icon.png').resize(64, 64).png().toBuffer();
const downloadUrl = 'https://flyright.godetour.link/0tItTZgtyO';
const qr = await QRCode.toBuffer(downloadUrl, { errorCorrectionLevel: 'M', margin: 4, scale: 6 });
const qrMeta = await sharp(qr).metadata();
const appStore = await sharp(new URL('../sharing-demo/assets/app-store.svg', import.meta.url).pathname, { density: 288 })
  .resize({ height: 58 }).png().toBuffer();
const googlePlay = await sharp(new URL('../sharing-demo/assets/google-play.png', import.meta.url).pathname)
  .trim().resize({ height: 58 }).png().toBuffer();
const googlePlayMeta = await sharp(googlePlay).metadata();
for (const [name, phone] of Object.entries(frames)) {
  const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${phone.width}" height="${phone.height}"><rect width="100%" height="100%" fill="black"/><rect width="100%" height="100%" rx="${phone.radius}" fill="white"/></svg>`;
  await sharp(Buffer.from(mask)).removeAlpha().png().toFile(`${out}/graphics/mask-${name}.png`);
}
let offset = 0;
const captions = [];
const timestamp = seconds => new Date(seconds * 1000).toISOString().slice(11, 23).replace('.', ',');
for (const [index, scene] of scenes.entries()) {
  const phone = frames[scene.device];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
    <defs><linearGradient id="bg" x1="0" x2="1" y1="1" y2="0"><stop stop-color="#050D1C"/><stop offset="1" stop-color="#142C4C"/></linearGradient><linearGradient id="edge"><stop stop-color="#657589"/><stop offset=".3" stop-color="#202C3B"/><stop offset="1" stop-color="#536477"/></linearGradient></defs>
    <rect width="1080" height="1350" fill="url(#bg)"/>
    <path d="M-100 980 Q220 170 1170 260" stroke="#71B7FB" stroke-opacity=".09" stroke-width="2" fill="none" stroke-dasharray="4 13"/>
    <image href="data:image/png;base64,${icon.toString('base64')}" x="52" y="44" width="64" height="64"/>
    <g font-family="Helvetica Neue,Helvetica,Arial,sans-serif" fill="#F1F6FF">
      <text x="132" y="87" font-size="35" font-weight="700">FlyRight</text>
      <text x="1022" y="82" text-anchor="end" fill="#A6C3E3" font-size="17" letter-spacing="2">INSIDE THE APP</text>
      <text x="56" y="269" font-size="60" font-weight="700" letter-spacing="-2">One link.</text>
      <text x="56" y="338" font-size="60" font-weight="700" letter-spacing="-2">Any phone.</text>
      <text x="56" y="405" font-size="25" fill="#A9BBD2">Even before the app is installed.</text>
      <rect x="56" y="515" width="62" height="5" rx="2.5" fill="#70B8FF"/>
      <text x="56" y="573" font-size="18" fill="#70B8FF" letter-spacing="3">${String(index + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')} · ${esc(scene.role === 'inviter' ? 'DANIEL · THE INVITER' : 'EMMA · THE INVITEE')}</text>
      ${scene.title.map((line, j) => `<text x="56" y="${638 + j * 51}" font-size="42" font-weight="650">${esc(line)}</text>`).join('')}
      ${scene.body.map((line, j) => `<text x="56" y="${797 + j * 35}" font-size="25" fill="#BAC9DD">${esc(line)}</text>`).join('')}
      <text x="56" y="900" font-size="24" fill="#70B8FF" font-weight="600">Detour by Software Mansion</text>
      <text x="56" y="936" font-size="23" fill="#BAC9DD">Deferred deep links on iOS + Android</text>
      <text x="56" y="982" font-size="26" font-weight="600">Scan to get FlyRight</text>
      <image href="data:image/png;base64,${qr.toString('base64')}" x="56" y="1010" width="${qrMeta.width}" height="${qrMeta.height}"/>
      <image href="data:image/png;base64,${appStore.toString('base64')}" x="298" y="1038" width="174" height="58"/>
      <image href="data:image/png;base64,${googlePlay.toString('base64')}" x="298" y="1130" width="${googlePlayMeta.width}" height="58"/>
      <text x="56" y="1268" font-size="24" font-weight="600">getflyright.com</text>
      <text x="56" y="1314" font-size="16" fill="#849BB7">iOS 26 simulator + iPhone 15 Pro</text>
      ${scenes.map((_, j) => `<rect x="${880 + j * 39}" y="1305" width="${j === index ? 29 : 11}" height="5" rx="2.5" fill="${j === index ? '#70B8FF' : '#3C5574'}"/>`).join('')}
    </g>
    <rect x="${phone.x - 10}" y="${phone.y - 10}" width="${phone.width + 20}" height="${phone.height + 20}" rx="${phone.radius + 10}" fill="url(#edge)"/>
    <rect x="${phone.x - 5}" y="${phone.y - 5}" width="${phone.width + 10}" height="${phone.height + 10}" rx="${phone.radius + 5}" fill="#030508"/>
    ${scene.device === 'ios'
      ? `<rect x="${phone.x - 14}" y="354" width="5" height="65" rx="2" fill="#485A70"/><rect x="${phone.x - 14}" y="438" width="5" height="65" rx="2" fill="#485A70"/><rect x="${phone.x + phone.width + 10}" y="391" width="5" height="96" rx="2" fill="#485A70"/>`
      : `<rect x="${phone.x + phone.width + 10}" y="330" width="5" height="70" rx="2" fill="#485A70"/><rect x="${phone.x + phone.width + 10}" y="420" width="5" height="120" rx="2" fill="#485A70"/>`}
  </svg>`;
  const background = `${out}/graphics/${scene.id}.png`;
  await sharp(Buffer.from(svg)).png().toFile(background);
  // A scene may hold a still (scene.image, a PNG) instead of a clip.
  if (scene.image) {
    const filter = `[1:v]scale=${phone.width}:${phone.height}:flags=lanczos,setsar=1,format=rgba[v];[2:v]format=gray[m];[v][m]alphamerge[screen];[0:v][screen]overlay=${phone.x}:${phone.y}:shortest=1,format=yuv420p[result]`;
    execFileSync('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-loop', '1', '-framerate', '30', '-i', background, '-loop', '1', '-framerate', '30', '-i', `${out}/${scene.image}`, '-loop', '1', '-framerate', '30', '-i', `${out}/graphics/mask-${scene.device}.png`, '-filter_complex', filter, '-map', '[result]', '-t', String(scene.duration), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-movflags', '+faststart', `${out}/segments/${scene.id}.mp4`], { stdio: 'inherit' });
    captions.push(`${index + 1}\n${timestamp(offset)} --> ${timestamp(offset + scene.duration)}\n${scene.title.join(' ')}\n${scene.body.join(' ')}\n`);
    offset += scene.duration;
    console.log(`Rendered ${scene.id} (still)`);
    continue;
  }
  const segs = scene.segments ?? [[scene.start, scene.end]];
  const sourceDuration = segs.reduce((a, [b, e]) => a + (e - b), 0);
  const factor = scene.hold ? 1 : scene.duration / sourceDuration;
  const hold = scene.hold ? `,tpad=stop_mode=clone:stop_duration=${scene.duration}` : `,tpad=stop_mode=clone:stop_duration=${scene.duration}`;
  // fps before trim: simulator recordings only carry frames where pixels changed.
  const trims = segs.map(([b, e], i) => `[1:v]fps=30,trim=start=${b}:end=${e},setpts=PTS-STARTPTS[t${i}]`).join(';');
  const cat = segs.map((_, i) => `[t${i}]`).join('') + `concat=n=${segs.length}:v=1:a=0`;
  const filter = `${trims};${cat},setpts=${factor.toFixed(6)}*PTS,fps=30${hold},scale=${phone.width}:${phone.height}:flags=lanczos,setsar=1,format=rgba[v];[2:v]format=gray[m];[v][m]alphamerge[screen];[0:v][screen]overlay=${phone.x}:${phone.y}:shortest=1,format=yuv420p[result]`;
  execFileSync('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-loop', '1', '-framerate', '30', '-i', background, '-i', `${out}/${scene.source}`, '-loop', '1', '-framerate', '30', '-i', `${out}/graphics/mask-${scene.device}.png`, '-filter_complex', filter, '-map', '[result]', '-t', String(scene.duration), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-movflags', '+faststart', `${out}/segments/${scene.id}.mp4`], { stdio: 'inherit' });
  captions.push(`${index + 1}\n${timestamp(offset)} --> ${timestamp(offset + scene.duration)}\n${scene.title.join(' ')}\n${scene.body.join(' ')}\n`);
  offset += scene.duration;
  console.log(`Rendered ${scene.id}`);
}
await writeFile(`${out}/segments/list.txt`, scenes.map(s => `file '${s.id}.mp4'`).join('\n'));
execFileSync('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${out}/segments/list.txt`, '-c', 'copy', '-movflags', '+faststart', `${out}/flyright-deferred-link-invitee.mp4`], { stdio: 'inherit' });
await writeFile(`${out}/flyright-deferred-link-invitee.srt`, captions.join('\n'));
execFileSync('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-i', `${out}/flyright-deferred-link-invitee.mp4`, '-frames:v', '1', `${out}/flyright-deferred-link-invitee-cover.png`], { stdio: 'inherit' });
console.log(`Exported ${offset}s to ${out}/flyright-deferred-link-invitee.mp4`);
