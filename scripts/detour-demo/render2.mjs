import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import sharp from 'sharp';

// Two phones side by side, 1080 × 1350: Daniel (the inviter) on the left,
// Emma (the invitee) on the right. Each scene says what each phone shows —
// a clip (one or more [start, end] segments of a recording, sped to fit),
// a still lifted from a recording at a time, or a PNG — and which side is
// "live"; the other side is dimmed so the eye follows the hand-off.
// Scenes come from edit2.json.
const out = resolve('demo/out/detour');
const work = `${out}/work2`;
await mkdir(work, { recursive: true });
await mkdir(`${out}/segments2`, { recursive: true });
const scenes = JSON.parse(await readFile(new URL('./edit2.json', import.meta.url), 'utf8'));
const phone = { width: 410, height: 891, radius: 50, y: 290 };
const sides = { left: { x: 62, label: 'DANIEL · THE INVITER' }, right: { x: 608, label: 'EMMA · THE INVITEE' } };
const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const icon = await sharp('assets/images/icon.png').resize(64, 64).png().toBuffer();
const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${phone.width}" height="${phone.height}"><rect width="100%" height="100%" fill="black"/><rect width="100%" height="100%" rx="${phone.radius}" fill="white"/></svg>`;
await sharp(Buffer.from(mask)).removeAlpha().png().toFile(`${work}/mask.png`);

/** One phone's footage for a scene, as a 30 fps clip of exactly `duration` seconds. */
function phoneClip(spec, duration, name) {
  const file = `${work}/${name}.mp4`;
  const fit = `scale=${phone.width}:${phone.height}:flags=lanczos,setsar=1,format=rgba[v];[m:v]format=gray[mm];[v][mm]alphamerge,format=yuva420p`;
  if (spec.image || spec.still) {
    let png = spec.image ? `${out}/${spec.image}` : `${work}/${name}-still.png`;
    if (spec.still) ff(['-ss', String(spec.still.at), '-i', `${out}/${spec.still.clip}`, '-frames:v', '1', png]);
    ff(['-loop', '1', '-framerate', '30', '-i', png, '-loop', '1', '-framerate', '30', '-i', `${work}/mask.png`,
      '-filter_complex', `[0:v]${fit.replace('[m:v]', '[1:v]')}[o]`, '-map', '[o]', '-t', String(duration), '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '20', `${work}/${name}.webm`]);
    return `${work}/${name}.webm`;
  }
  const segs = spec.segments;
  const total = segs.reduce((a, [s, e]) => a + (e - s), 0);
  const factor = duration / total;
  const trims = segs.map(([s, e], i) => `[0:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS[t${i}]`).join(';');
  const cat = segs.map((_, i) => `[t${i}]`).join('') + `concat=n=${segs.length}:v=1:a=0`;
  ff(['-i', `${out}/${spec.clip}`, '-loop', '1', '-framerate', '30', '-i', `${work}/mask.png`,
    '-filter_complex', `${trims};${cat},fps=30,setpts=${factor.toFixed(6)}*PTS,fps=30,tpad=stop_mode=clone:stop_duration=${duration},${fit.replace('[m:v]', '[1:v]')}[o]`,
    '-map', '[o]', '-t', String(duration), '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '20', `${work}/${name}.webm`]);
  return `${work}/${name}.webm`;
}

let offset = 0;
const captions = [];
const timestamp = seconds => new Date(seconds * 1000).toISOString().slice(11, 23).replace('.', ',');
for (const [index, scene] of scenes.entries()) {
  const active = side => scene.active === 'both' || scene.active === side;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
    <defs><linearGradient id="bg" x1="0" x2="1" y1="1" y2="0"><stop stop-color="#050D1C"/><stop offset="1" stop-color="#142C4C"/></linearGradient><linearGradient id="edge"><stop stop-color="#657589"/><stop offset=".3" stop-color="#202C3B"/><stop offset="1" stop-color="#536477"/></linearGradient></defs>
    <rect width="1080" height="1350" fill="url(#bg)"/>
    <path d="M-100 1000 Q300 120 1180 300" stroke="#71B7FB" stroke-opacity=".09" stroke-width="2" fill="none" stroke-dasharray="4 13"/>
    <image href="data:image/png;base64,${icon.toString('base64')}" x="52" y="44" width="64" height="64"/>
    <g font-family="Helvetica Neue,Helvetica,Arial,sans-serif" fill="#F1F6FF">
      <text x="132" y="87" font-size="35" font-weight="700">FlyRight</text>
      <text x="1028" y="82" text-anchor="end" fill="#A6C3E3" font-size="17" letter-spacing="2">INSIDE THE APP · iOS 26 SIMULATORS</text>
      <text x="52" y="178" font-size="40" font-weight="700" letter-spacing="-1.2">One link. Any phone. Even before the app is installed.</text>
      <text x="52" y="216" font-size="22" fill="#A9BBD2">Deferred deep links with Detour by Software Mansion</text>
      ${Object.entries(sides).map(([side, s]) => `
        <circle cx="${s.x + 10}" cy="${phone.y - 24}" r="6" fill="${active(side) ? '#4ADE80' : '#3C5574'}"/>
        <text x="${s.x + 26}" y="${phone.y - 17}" font-size="17" font-weight="600" letter-spacing="2" fill="${active(side) ? '#F1F6FF' : '#7F93AD'}">${esc(s.label)}</text>
        <rect x="${s.x - 9}" y="${phone.y - 9}" width="${phone.width + 18}" height="${phone.height + 18}" rx="${phone.radius + 9}" fill="url(#edge)"/>
        <rect x="${s.x - 4}" y="${phone.y - 4}" width="${phone.width + 8}" height="${phone.height + 8}" rx="${phone.radius + 4}" fill="#030508"/>
        <rect x="${s.x - 12}" y="${phone.y + 150}" width="4" height="52" rx="2" fill="#485A70"/><rect x="${s.x - 12}" y="${phone.y + 218}" width="4" height="52" rx="2" fill="#485A70"/><rect x="${s.x + phone.width + 8}" y="${phone.y + 180}" width="4" height="80" rx="2" fill="#485A70"/>`).join('')}
      <text x="52" y="1240" font-size="18" fill="#70B8FF" letter-spacing="3">${String(index + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}</text>
      <text x="52" y="1281" font-size="36" font-weight="650">${esc(scene.title)}</text>
      <text x="52" y="1318" font-size="23" fill="#BAC9DD">${esc(scene.body)}</text>
      <text x="1028" y="1240" text-anchor="end" font-size="20" font-weight="600">getflyright.com</text>
      ${scenes.map((_, j) => `<rect x="${1028 - (scenes.length - j) * 22}" y="1308" width="${j === index ? 18 : 10}" height="5" rx="2.5" fill="${j === index ? '#70B8FF' : '#3C5574'}"/>`).join('')}
    </g>
  </svg>`;
  const background = `${work}/bg-${scene.id}.png`;
  await sharp(Buffer.from(svg)).png().toFile(background);
  // The dimmer sits ABOVE the footage: one rounded rect per inactive side.
  const dim = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">${Object.entries(sides).filter(([side]) => !active(side)).map(([, s]) => `<rect x="${s.x}" y="${phone.y}" width="${phone.width}" height="${phone.height}" rx="${phone.radius}" fill="#050D1C" fill-opacity="0.62"/>`).join('')}</svg>`;
  const dimmer = `${work}/dim-${scene.id}.png`;
  await sharp(Buffer.from(dim)).png().toFile(dimmer);
  const left = phoneClip(scene.left, scene.duration, `${scene.id}-L`);
  const right = phoneClip(scene.right, scene.duration, `${scene.id}-R`);
  ff(['-loop', '1', '-framerate', '30', '-i', background, '-c:v', 'libvpx-vp9', '-i', left, '-c:v', 'libvpx-vp9', '-i', right, '-loop', '1', '-framerate', '30', '-i', dimmer,
    '-filter_complex', `[0:v][1:v]overlay=${sides.left.x}:${phone.y}[a];[a][2:v]overlay=${sides.right.x}:${phone.y}[b];[b][3:v]overlay=0:0,format=yuv420p[o]`,
    '-map', '[o]', '-t', String(scene.duration), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-movflags', '+faststart', `${out}/segments2/${scene.id}.mp4`]);
  captions.push(`${index + 1}\n${timestamp(offset)} --> ${timestamp(offset + scene.duration)}\n${scene.title}\n${scene.body}\n`);
  offset += scene.duration;
  console.log(`Rendered ${scene.id}`);
}
await writeFile(`${out}/segments2/list.txt`, scenes.map(s => `file '${s.id}.mp4'`).join('\n'));
ff(['-f', 'concat', '-safe', '0', '-i', `${out}/segments2/list.txt`, '-c', 'copy', '-movflags', '+faststart', `${out}/flyright-deferred-link-two-phones.mp4`]);
await writeFile(`${out}/flyright-deferred-link-two-phones.srt`, captions.join('\n'));
ff(['-i', `${out}/flyright-deferred-link-two-phones.mp4`, '-frames:v', '1', `${out}/flyright-deferred-link-two-phones-cover.png`]);
console.log(`Exported ${offset}s to ${out}/flyright-deferred-link-two-phones.mp4`);
