#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.DEMO_OUT || join(HERE, 'output');
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const board = JSON.parse(await readFile(join(HERE, 'storyboard.json'), 'utf8'));
const film = join(OUT, 'flyright-shipaton-1m59s.mp4');
const report = { checkedAt: new Date().toISOString(), rawClips: [], video: {}, audio: {} };
const finalTiles = [];
let at = 0;
function run(args, binary = false) {
  const p = spawnSync(ffmpeg, args, { encoding: binary ? null : 'utf8', maxBuffer: 30 * 1024 * 1024 });
  if (p.error || p.status !== 0) throw new Error(p.error?.message || p.stderr.toString());
  return p;
}
for (const [index, scene] of board.scenes.entries()) {
  const rawPath = join(OUT, 'raw', `${scene.id}.mp4`);
  let frames = run(['-v', 'error', '-i', rawPath, '-vf', 'fps=2,scale=120:260', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], true).stdout;
  // simctl can encode a completely still screen as one frame plus a hold.
  // Recent FFmpeg versions discard that frame when sampling below its rate.
  if (!frames.length) {
    frames = run(['-v', 'error', '-i', rawPath, '-frames:v', '1', '-vf', 'scale=120:260', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], true).stdout;
  }
  const size = 120 * 260 * 3;
  const count = Math.floor(frames.length / size);
  if (count < 1) throw new Error(`${scene.id}: no decoded frames`);
  const flagged = [];
  for (let f = 0; f < count; f++) {
    let consecutive = 0;
    for (let y = 10; y < 70; y++) {
      let blue = 0;
      for (let x = 0; x < 120; x++) {
        const p = f * size + (y * 120 + x) * 3;
        if (frames[p] < 75 && frames[p + 1] > 100 && frames[p + 1] < 173 && frames[p + 2] > 185) blue++;
      }
      consecutive = blue > 115 ? consecutive + 1 : 0;
      if (consecutive >= 4) { flagged.push(f / 2); break; }
    }
  }
  report.rawClips.push({ id: scene.id, sampledFrames: count, loadingBannerTimes: flagged });
  console.log(`${scene.id}: ${count} sampled frames; ${flagged.length ? 'LOADING BANNER FOUND' : 'no loading banner'}`);
  if (flagged.length) throw new Error(`${scene.id} still has a development loading banner at ${flagged.join(', ')} seconds.`);
  const tile = run(['-v', 'error', '-ss', String(at + Math.min(5, scene.duration / 2)), '-i', film, '-frames:v', '1', '-vf', 'scale=640:-1', '-f', 'image2pipe', '-vcodec', 'png', '-'], true).stdout;
  if (!tile.length) throw new Error(`${scene.id}: no final video frame`);
  finalTiles.push({ input: tile, left: (index % 3) * 640, top: Math.floor(index / 3) * 360 });
  at += scene.duration;
}
await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#183456' } }).composite(finalTiles).png().toFile(join(OUT, 'qa-final.png'));
const metadata = spawnSync(ffmpeg, ['-hide_banner', '-i', film], { encoding: 'utf8' }).stderr;
const durationMatch = metadata.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
const seconds = Number(durationMatch?.[1]) * 3600 + Number(durationMatch?.[2]) * 60 + Number(durationMatch?.[3]);
if (!(seconds >= 118.9 && seconds < 120)) throw new Error(`Bad duration: ${seconds}`);
report.video = { duration: seconds, format: '1920×1080 H.264, 30 fps', fullDecode: 'passed' };
if (!/1920x1080/.test(metadata) || !/Video: h264/.test(metadata) || !/30 fps/.test(metadata)) throw new Error('Unexpected video encoding');
run(['-v', 'error', '-i', film, '-f', 'null', '-']);
const audio = run(['-hide_banner', '-i', film, '-vn', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json', '-f', 'null', '-']).stderr;
const meter = JSON.parse(audio.match(/\{[\s\S]*"input_i"[\s\S]*\}/)?.[0] || '{}');
report.audio = { integratedLUFS: Number(meter.input_i), truePeakDBTP: Number(meter.input_tp), loudnessRangeLU: Number(meter.input_lra) };
if (!(report.audio.integratedLUFS > -19 && report.audio.integratedLUFS < -13 && report.audio.truePeakDBTP <= -1)) throw new Error(`Unexpected audio levels: ${JSON.stringify(report.audio)}`);
await writeFile(join(OUT, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Verified: ${seconds}s; ${report.audio.integratedLUFS} LUFS; peak ${report.audio.truePeakDBTP} dBTP; all video decodes.`);
