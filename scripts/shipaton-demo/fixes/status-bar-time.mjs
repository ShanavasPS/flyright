/**
 * Give every app scene of the Maja cut a status-bar clock that follows her
 * day. The recordings mix the simulator's "9.41" override with the real
 * clock ("1:23", "11:26", "1:34") and, on seven clips, the screen-recording
 * pill hanging off the Dynamic Island. Per clip this script:
 *   1. finds the clock on the first frame (bright glyphs in the left cluster)
 *      and whether the red recording dot is there;
 *   2. writes a mask of the clock box, plus the pill/island area when the dot
 *      is present, and lets ffmpeg's removelogo rebuild the background under
 *      it on every frame (the status bar dims under sheets, and the boarding
 *      pass turns it white, so a static patch would not do);
 *   3. redraws the island as the plain black pill the other clips show;
 *   4. overlays the scheduled time in the override's style — SF Pro Text
 *      Semibold, 40 px cap height, centred where "9.41" sat — white, or
 *      black once the pass scene's status bar has turned light.
 *
 * Usage: SRC=<raw dir> DST=<raw dir> node scripts/shipaton-demo/fixes/status-bar-time.mjs
 * Clips not in the schedule (the Lock Screen) are copied untouched.
 */
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(process.env.SRC || join(HERE, '../output/story-v2/raw'));
const DST = resolve(process.env.DST || join(HERE, '../output/story-v3/raw'));
const WORK = join(DST, '.status-bar');
await mkdir(WORK, { recursive: true });
const board = JSON.parse(await readFile(join(HERE, '../storyboard-story.json'), 'utf8'));

// Maja's day, read off each scene's own screen: at the airport before a
// 1:55 PM departure, in the air over the evening, landed in Tokyo before
// dawn local time. The Lock Screen keeps its own big clock.
const SCHEDULE = {
  '02-home': '1.04', '02-terminal': '1.06', '03-steps': '1.12', '04-pass': '1.31',
  '06-inair': '7.42', '07-globe': '7.45', '07b-world': '7.46', '16-poster': '7.48',
  '05-add': '7.52', '09-updates': '7.55', '10-theirday': '7.56', '08-postcard': '7.58',
  '12-belt': '4.36', '15-claims': '4.41', '13-pro': '4.44', '14-plans': '4.45', '17-close': '4.47',
};

// Geometry is measured on the 1206 × 2622 override clips; the seven clips
// recorded with the pill are 1180 × 2556, so every layer is scaled to the
// clip it patches (k = width / 1206).
const REF_W = 1206;
const CLOCK = { centerX: 244, capTop: 77, size: 57, weight: 600, capOffset: 60 }; // "9.41" as the override draws it
const ISLAND = { x: 461, y: 42, w: 513, h: 110 }; // the plain Dynamic Island in the override clips
const PILL_BOX = { x: 312, y: 26, w: 720, h: 136 }; // island plus the recording pill and its red ring
const dims = (clip) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', clip]).toString().trim().split(',').map(Number);
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

async function frameAt(clip, seconds, out) {
  ff(['-ss', String(seconds), '-i', clip, '-frames:v', '1', out]);
  return out;
}
async function findClock(frame) {
  const box = { left: 0, top: 30, width: 460, height: 110 };
  const { data, info } = await sharp(frame).extract(box).raw().toBuffer({ resolveWithObject: true });
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, red = false;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const p = (y * info.width + x) * 3, r = data[p], g = data[p + 1], b = data[p + 2];
    if (r > 200 && g > 200 && b > 200) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (r > 150 && g < 110 && b < 110) red = true;
  }
  return x1 < 0 ? null : { x0: box.left + x0, x1: box.left + x1, y0: box.top + y0, y1: box.top + y1, red };
}
/** First time the status-bar background is light (the boarding pass), or null. */
function lightFrom(clip) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', clip, '-vf', 'format=rgb24,crop=2:2:60:94', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
  for (let f = 0; f * 12 < raw.length; f++) if ((raw[f * 12] + raw[f * 12 + 1] + raw[f * 12 + 2]) / 3 > 128) return f / 30;
  return null;
}
async function textLayer(text, fill, path, W, H) {
  const k = W / REF_W;
  const baseline = (CLOCK.capTop + (100 - CLOCK.capOffset)) * k;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><text x="${CLOCK.centerX * k}" y="${baseline}" text-anchor="middle" font-family="SF Pro Text" font-size="${CLOCK.size * k}" font-weight="${CLOCK.weight}" fill="${fill}">${text}</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path);
  return path;
}
async function islandLayer(W, H) {
  const k = W / REF_W, path = join(WORK, `island-${W}.png`);
  await sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect x="${ISLAND.x * k}" y="${ISLAND.y * k}" width="${ISLAND.w * k}" height="${ISLAND.h * k}" rx="${ISLAND.h * k / 2}" fill="#000"/></svg>`)).png().toFile(path);
  return path;
}

const report = [];
for (const scene of board.scenes) {
  const src = join(SRC, `${scene.id}.mp4`), dst = join(DST, `${scene.id}.mp4`);
  const time = SCHEDULE[scene.id];
  if (!time) { await copyFile(src, dst); report.push(`${scene.id}: copied (no status-bar clock)`); continue; }
  const [W, H] = dims(src);
  const k = W / REF_W;
  const frame = await frameAt(src, 0.1, join(WORK, `${scene.id}-first.png`));
  const clock = await findClock(frame);
  if (!clock) throw new Error(`${scene.id}: no clock found on the first frame`);
  const m = 8;
  const boxes = [`<rect x="${clock.x0 - m}" y="${clock.y0 - m}" width="${clock.x1 - clock.x0 + 2 * m}" height="${clock.y1 - clock.y0 + 2 * m}" fill="#fff"/>`];
  if (clock.red) boxes.push(`<rect x="${PILL_BOX.x * k}" y="${PILL_BOX.y * k}" width="${PILL_BOX.w * k}" height="${PILL_BOX.h * k}" fill="#fff"/>`);
  const mask = join(WORK, `${scene.id}-mask.png`);
  await sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000"/>${boxes.join('')}</svg>`)).removeAlpha().png().toFile(mask);

  const white = await textLayer(time, '#ffffff', join(WORK, `${scene.id}-time-light.png`), W, H);
  const flip = lightFrom(src);
  const inputs = ['-i', src, '-i', white];
  let chain = `[0:v]removelogo=${mask}[e];`;
  let last = '[e]';
  if (flip !== null) {
    const dark = await textLayer(time, '#000000', join(WORK, `${scene.id}-time-dark.png`), W, H);
    inputs.push('-i', dark);
    chain += `${last}[1:v]overlay=0:0:enable='lt(t,${flip.toFixed(3)})'[w];[w][2:v]overlay=0:0:enable='gte(t,${flip.toFixed(3)})'[t];`;
  } else {
    chain += `${last}[1:v]overlay=0:0[t];`;
  }
  last = '[t]';
  if (clock.red) {
    inputs.push('-i', await islandLayer(W, H));
    chain += `${last}[${inputs.length / 2 - 1}:v]overlay=0:0[i];`;
    last = '[i]';
  }
  chain += `${last}format=yuv420p[v]`;
  ff([...inputs, '-filter_complex', chain, '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-movflags', '+faststart', dst]);
  report.push(`${scene.id}: ${time}${clock.red ? ', recording pill removed' : ''}${flip !== null ? `, dark clock from ${flip.toFixed(2)}s` : ''} (${W}×${H}, clock was at x ${clock.x0}-${clock.x1})`);
  console.log(report.at(-1));
}
await writeFile(join(WORK, 'report.txt'), report.join('\n') + '\n');
