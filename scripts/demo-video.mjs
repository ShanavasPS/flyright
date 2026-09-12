#!/usr/bin/env node
/**
 * Builds the Shipaton demo video end to end: records each scene on the iOS
 * simulator while a Maestro flow drives the RELEASE app, renders the
 * narration with macOS `say`, and composes phone + captions + voice into a
 * 1920×1080 cut with ffmpeg. Scenes, narration and captions live in
 * demo/scenes.mjs; the flows in .maestro/demo/.
 *
 *   node scripts/demo-video.mjs voice                 # narration → demo/out/voice
 *   node scripts/demo-video.mjs setup    [--sim udid] # first launch + sign-in + seed (not recorded)
 *   node scripts/demo-video.mjs record   [--sim udid] [--only 03-add-flight]
 *   node scripts/demo-video.mjs assemble [--music path.mp3]
 *   node scripts/demo-video.mjs all      [--sim udid] [--music path.mp3]
 *
 * Prerequisites (see demo/README.md): ffmpeg on PATH (brew install ffmpeg),
 * the Maestro CLI, a booted simulator with the Release build installed —
 *   FLYRIGHT_ROUTER_ORIGIN=http://localhost:8081 npx expo run:ios --configuration Release --no-bundler --device <udid>
 * — and `npx expo start` serving the API routes on :8081 so live lookups work.
 *
 * Gotchas: the dev client paints a "Refreshing…" banner into every capture,
 * so only a Release build is worth recording; `simctl recordVideo` stops on
 * SIGINT and needs a beat after the flow to flush; the Maestro CLI can hang
 * after a flow passes, so runs are killed on a timeout and the capture kept.
 */
import { Buffer } from 'node:buffer';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

import { SCENES, VOICE, VOICE_RATE } from '../demo/scenes.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const OUT = join(ROOT, 'demo/out');
const DIRS = {
  voice: join(OUT, 'voice'),
  capture: join(OUT, 'capture'),
  art: join(OUT, 'art'),
  segments: join(OUT, 'segments'),
};
for (const d of Object.values(DIRS)) mkdirSync(d, { recursive: true });

const MAESTRO = process.env.MAESTRO_BIN ?? join(homedir(), '.maestro/bin/maestro');
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'shipaton+clerk_test@example.com';
const DEMO_FLIGHT = process.env.DEMO_FLIGHT ?? 'AY1331';
/** 'true' once the demo user holds the Pro entitlement (RevenueCat dashboard
 * grant) — the claim scene then walks through to the letter. */
const DEMO_PRO = process.env.DEMO_PRO ?? 'false';
const FINAL = join(OUT, 'flyright-demo.mp4');

const W = 1920;
const H = 1080;
/** Phone slot: the capture scaled to this height, right of centre. */
const PHONE_H = 964;
const PHONE_Y = (H - PHONE_H) / 2;
const PHONE_RIGHT_MARGIN = 190;
const NAVY = '#0B1630';
const NAVY_DEEP = '#060C1C';
const WHITE = '#FFFFFF';
const SUB = '#B9C8DE';
const COBALT = '#4E9BF5';
const GREEN = '#2FD68C';
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};

const sh = (file, args, opts = {}) =>
  execFileSync(file, args, { stdio: opts.quiet ? 'pipe' : 'inherit', cwd: ROOT, ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function bootedSim() {
  const fromArg = opt('sim') ?? process.env.DEMO_SIM;
  if (fromArg) return fromArg;
  const list = execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted']).toString();
  const m = list.match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/);
  if (!m) throw new Error('no booted simulator — pass --sim <udid>');
  return m[0];
}

function probeDuration(file) {
  return Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
      .toString()
      .trim(),
  );
}

function probeSize(file) {
  const [w, h] = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file,
  ])
    .toString()
    .trim()
    .split('x')
    .map(Number);
  return { w, h };
}

/* ---------------------------------------------------------------- voice */

function voice() {
  const durations = {};
  for (const scene of SCENES) {
    const aiff = join(DIRS.voice, `${scene.id}.aiff`);
    sh('say', ['-v', VOICE, '-r', String(VOICE_RATE), '-o', aiff, scene.narration]);
    durations[scene.id] = probeDuration(aiff);
    console.log(`${scene.id}: ${durations[scene.id].toFixed(1)}s`);
  }
  writeFileSync(join(DIRS.voice, 'durations.json'), JSON.stringify(durations, null, 2));
  const total = SCENES.reduce((s, sc) => s + durations[sc.id] + sc.tail + 0.35, 0);
  console.log(`narration + tails ≈ ${total.toFixed(1)}s (limit 120s)`);
  return durations;
}

/* ------------------------------------------------------------- simulator */

/** Runs a flow; resolves with the wall-clock moments that matter for the cut:
 * `screens` = every "is visible … COMPLETED" step (the app has painted a real
 * screen — everything before the first is Maestro warming up and the
 * splash; a scene's `trimAt` picks which one opens it), `end` = the last
 * step, `endAfter` = a scene's chosen closing step plus its hold. */
function maestro(udid, flow, env = {}, scene = {}, timeoutMs = 240_000) {
  const args = ['--device', udid, 'test'];
  for (const [k, v] of Object.entries(env)) args.push('-e', `${k}=${v}`);
  args.push(join(ROOT, flow));
  return new Promise((resolveRun) => {
    const child = spawn(MAESTRO, args, { stdio: ['ignore', 'pipe', 'inherit'], cwd: ROOT });
    const marks = { screens: [], end: null, endAfter: null, failed: false };
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const text = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
        if (!text) continue;
        if (/^(Assert|Tap|Input|Swipe|Open|Launch|Press|Erase|Hide|Run)/.test(text)) console.log(`    ${text}`);
        if (/COMPLETED|FAILED|WARNED/.test(text)) marks.end = Date.now();
        if (scene.endAfter && marks.endAfter == null && text.startsWith(scene.endAfter.step) && /COMPLETED/.test(text)) {
          marks.endAfter = Date.now() + scene.endAfter.hold * 1000;
        }
        if (/is visible\.\.\. COMPLETED/.test(text) && !/demo-pause/.test(text)) marks.screens.push(Date.now());
        if (/FAILED/.test(text)) marks.failed = true;
      }
    });
    const timer = setTimeout(() => {
      console.warn(`maestro still running after ${timeoutMs / 1000}s — killing (the flow itself usually passed)`);
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('exit', () => {
      clearTimeout(timer);
      resolveRun(marks);
    });
  });
}

function seed(udid, travelDay) {
  try {
    execFileSync('xcrun', ['simctl', 'terminate', udid, 'com.shanavasshaji.flyright'], { stdio: 'ignore' });
  } catch {
    /* not running */
  }
  const args = ['scripts/seed-demo-data.mjs', '--ios', '--sim', udid];
  if (travelDay) args.push('--travel-day');
  sh('node', args);
}

async function setup(udid) {
  await maestro(udid, '.maestro/demo/setup.yaml', { EMAIL: DEMO_EMAIL });
  seed(udid, false);
}

async function record(udid) {
  const only = opt('only')?.split(',') ?? null;
  let seeded = null;
  for (const scene of SCENES) {
    if (scene.kind !== 'recording') continue;
    if (only && !only.includes(scene.id)) continue;
    const wantSeed = scene.seed === 'travelDay' ? 'travelDay' : 'plain';
    if (seeded !== wantSeed) {
      seed(udid, wantSeed === 'travelDay');
      if (wantSeed === 'travelDay') await maestro(udid, '.maestro/demo/travel-day-allow.yaml');
      seeded = wantSeed;
    }
    const file = join(DIRS.capture, `${scene.id}.mp4`);
    rmSync(file, { force: true });
    console.log(`\n▶ recording ${scene.id}`);
    const rec = spawn('xcrun', ['simctl', 'io', udid, 'recordVideo', '--codec', 'h264', '--force', file], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    const recStart = Date.now();
    await sleep(1500);
    const marks = await maestro(udid, scene.flow, { FLIGHT: DEMO_FLIGHT, PRO: DEMO_PRO }, scene);
    await sleep((scene.tail + 1) * 1000);
    rec.kill('SIGINT');
    await new Promise((r) => rec.on('exit', r));
    // Where the cut starts and how long the footage really is, so assemble
    // can skip the warm-up and never cut a flow short.
    const opening = marks.screens[(scene.trimAt ?? 1) - 1] ?? marks.screens[0] ?? recStart + 1500;
    const start = Math.max(0, (opening - recStart) / 1000 - 0.4);
    const footage = ((marks.endAfter ?? marks.end ?? Date.now()) - recStart) / 1000 - start + 0.6;
    writeFileSync(join(DIRS.capture, `${scene.id}.json`), JSON.stringify({ start, footage, failed: marks.failed }, null, 2));
    console.log(`  ${file} (${probeDuration(file).toFixed(1)}s, cut from ${start.toFixed(1)}s, footage ${footage.toFixed(1)}s${marks.failed ? ', FLOW FAILED' : ''})`);
  }
}

/* ------------------------------------------------------------------ art */

function roundedRect(x, y, w, h, r, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" ${extra}/>`;
}

async function worldSilhouette(opacity) {
  const { land, width } = JSON.parse(readFileSync(join(ROOT, 'assets/data/world-map.json'), 'utf8'));
  const s = (W * 1.15) / width;
  return `<g transform="translate(${-W * 0.08} ${H * 0.12}) scale(${s})" opacity="${opacity}">
    <path d="${land}" fill="${COBALT}" fill-rule="evenodd"/></g>`;
}

/** Night-sky ground shared by every scene: navy gradient, faint world,
 * one glowing route arc — the feature graphic's family. */
async function background() {
  const file = join(DIRS.art, 'bg.png');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <radialGradient id="sky" cx="30%" cy="20%" r="90%">
        <stop offset="0" stop-color="#14264A"/><stop offset="0.6" stop-color="${NAVY}"/><stop offset="1" stop-color="${NAVY_DEEP}"/>
      </radialGradient>
      <linearGradient id="route" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="${COBALT}" stop-opacity="0"/><stop offset="0.5" stop-color="${COBALT}"/><stop offset="1" stop-color="${GREEN}"/>
      </linearGradient>
      <filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    ${await worldSilhouette(0.11)}
    <path d="M -60 980 Q 520 900 1040 560 T 1980 120" fill="none" stroke="url(#route)" stroke-width="10" opacity="0.55" filter="url(#blur)"/>
    <path d="M -60 980 Q 520 900 1040 560 T 1980 120" fill="none" stroke="url(#route)" stroke-width="2.5" opacity="0.7" stroke-dasharray="14 12"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

/** The phone bezel + glow baked onto the background for phone scenes, and a
 * luma mask that rounds the capture's corners. */
async function phoneArt(bg, pw, ph) {
  const px = W - PHONE_RIGHT_MARGIN - pw;
  const r = Math.round(pw * 0.135);
  const bezel = 11;
  const frame = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="34"/></filter></defs>
    ${roundedRect(px - bezel, PHONE_Y - bezel, pw + bezel * 2, ph + bezel * 2, r + bezel, `fill="${COBALT}" opacity="0.28" filter="url(#glow)"`)}
    ${roundedRect(px - bezel, PHONE_Y - bezel, pw + bezel * 2, ph + bezel * 2, r + bezel, `fill="#0A1224" stroke="rgba(255,255,255,0.16)" stroke-width="1.5"`)}
  </svg>`;
  const bgPhone = join(DIRS.art, 'bg-phone.png');
  await sharp(bg).composite([{ input: Buffer.from(frame) }]).png().toFile(bgPhone);
  const mask = join(DIRS.art, 'mask.png');
  await sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}">
      <rect width="${pw}" height="${ph}" fill="black"/>${roundedRect(0, 0, pw, ph, r, 'fill="white"')}</svg>`),
  )
    .png()
    .toFile(mask);
  return { bgPhone, mask, px };
}

function captionSvg(scene, maxW) {
  const x = 150;
  const lines = [];
  let y = 330;
  lines.push(
    `<text x="${x}" y="${y}" font-family="${FONT}" font-size="26" font-weight="700" letter-spacing="4" fill="${GREEN}">${esc(scene.eyebrow.toUpperCase())}</text>`,
  );
  y += 78;
  // Wrap the title on a rough width estimate (0.52em per glyph at 64px).
  const words = scene.title.split(' ');
  const perLine = Math.floor(maxW / (64 * 0.52));
  let line = '';
  const titleLines = [];
  for (const w of words) {
    if ((line + ' ' + w).trim().length > perLine) {
      titleLines.push(line.trim());
      line = w;
    } else line = `${line} ${w}`;
  }
  if (line.trim()) titleLines.push(line.trim());
  for (const t of titleLines) {
    lines.push(`<text x="${x}" y="${y}" font-family="${FONT}" font-size="64" font-weight="700" fill="${WHITE}">${esc(t)}</text>`);
    y += 76;
  }
  y += 34;
  for (const b of scene.bullets) {
    lines.push(`<circle cx="${x + 9}" cy="${y - 11}" r="6" fill="${GREEN}"/>`);
    lines.push(`<text x="${x + 34}" y="${y}" font-family="${FONT}" font-size="31" fill="${SUB}">${esc(b)}</text>`);
    y += 54;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${lines.join('')}</svg>`;
}

async function captionArt(scene, maxW) {
  const file = join(DIRS.art, `${scene.id}-caption.png`);
  await sharp(Buffer.from(captionSvg(scene, maxW))).png().toFile(file);
  return file;
}

async function iconBadge(size) {
  return sharp(join(ROOT, 'assets/images/icon.png'))
    .resize(size, size)
    .composite([
      {
        input: Buffer.from(
          `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}" ry="${size * 0.22}" fill="white"/></svg>`,
        ),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();
}

/** Full-frame title / outro overlays (RGBA on transparent, the background
 * shows through so the cut never leaves the night sky). */
async function cardArt(kind) {
  const file = join(DIRS.art, `${kind}-card.png`);
  const icon = await iconBadge(220);
  const cx = W / 2;
  const text =
    kind === 'title'
      ? `
      <text x="${cx}" y="600" text-anchor="middle" font-family="${FONT}" font-size="112" font-weight="700" fill="${WHITE}">FlyRight</text>
      <text x="${cx}" y="672" text-anchor="middle" font-family="${FONT}" font-size="38" fill="${SUB}">Your travel buddy on the day you fly — and your advocate when the flight goes wrong.</text>
      <text x="${cx}" y="820" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="700" letter-spacing="5" fill="${GREEN}">SHIPATON 2026  ·  iOS  ·  ANDROID  ·  WEB</text>`
      : `
      <text x="${cx}" y="590" text-anchor="middle" font-family="${FONT}" font-size="96" font-weight="700" fill="${WHITE}">FlyRight: Flight Tracker</text>
      <text x="${cx}" y="660" text-anchor="middle" font-family="${FONT}" font-size="40" fill="${SUB}">Trackers tell you it’s late. We tell you what you’re owed.</text>
      ${pill(cx - 470, 760, 280, 'App Store')}${pill(cx - 140, 760, 280, 'Google Play')}${pill(cx + 190, 760, 280, 'getflyright.com')}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${text}</svg>`;
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: icon, left: cx - 110, top: 290 },
      { input: Buffer.from(svg) },
    ])
    .png()
    .toFile(file);
  return file;
}

function pill(x, y, w, label) {
  return `${roundedRect(x, y, w, 72, 36, `fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"`)}
    <text x="${x + w / 2}" y="${y + 47}" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="600" fill="${WHITE}">${esc(label)}</text>`;
}

/* ------------------------------------------------------------- assemble */

const VO_DELAY = 0.35;
const FADE = 0.45;
/** Footage longer than its narration is played faster, up to this much,
 * before the scene is allowed to outlast the voice. */
const MAX_SPEEDUP = 1.5;

function encodeArgs(duration, out) {
  return [
    '-r', '30', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(duration), out,
  ];
}

function audioChain(index, duration) {
  const ms = Math.round(VO_DELAY * 1000);
  return `[${index}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${ms}|${ms},apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[a]`;
}

function captureMeta(scene) {
  const file = join(DIRS.capture, `${scene.id}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { start: 0, footage: 0 };
}

async function segmentPhone(scene, duration, art, voiceFile) {
  const out = join(DIRS.segments, `${scene.id}.mp4`);
  const isStill = scene.kind === 'still';
  const src = isStill ? join(ROOT, scene.still) : join(DIRS.capture, `${scene.id}.mp4`);
  if (!existsSync(src)) throw new Error(`${scene.id}: missing ${src} — run record first`);
  const start = isStill ? 0 : captureMeta(scene).start;
  const speed = isStill ? 1 : scene.speed ?? 1;
  const caption = await captionArt(scene, art.px - 150 - 90);
  const fadeOut = (duration - FADE).toFixed(2);
  const filter = [
    `[0:v]format=rgb24[bg]`,
    `[1:v]setpts=PTS/${speed},trim=duration=${duration},setpts=PTS-STARTPTS,fps=30,scale=${art.pw}:${art.ph}:flags=lanczos,tpad=stop_mode=clone:stop_duration=${duration},trim=duration=${duration},setpts=PTS-STARTPTS,format=rgba[ph]`,
    `[2:v]format=gray[mk]`,
    `[ph][mk]alphamerge,fade=t=in:st=0:d=${FADE}:alpha=1,fade=t=out:st=${fadeOut}:d=${FADE}:alpha=1[phm]`,
    `[3:v]format=rgba,fade=t=in:st=0.25:d=0.5:alpha=1,fade=t=out:st=${fadeOut}:d=${FADE}:alpha=1[cap]`,
    `[bg][phm]overlay=${art.px}:${PHONE_Y}:shortest=1[v1]`,
    `[v1][cap]overlay=0:0:shortest=1,format=yuv420p[v]`,
    audioChain(4, duration),
  ].join(';');
  const srcArgs = isStill ? ['-loop', '1', '-i', src] : ['-ss', String(start), '-i', src];
  sh('ffmpeg', [
    '-y', '-loglevel', 'error', '-stats',
    '-loop', '1', '-i', art.bgPhone, ...srcArgs, '-loop', '1', '-i', art.mask, '-loop', '1', '-i', caption, '-i', voiceFile,
    '-filter_complex', filter, '-map', '[v]', '-map', '[a]', ...encodeArgs(duration, out),
  ]);
  return out;
}

async function segmentCard(scene, duration, bg, voiceFile) {
  const out = join(DIRS.segments, `${scene.id}.mp4`);
  const card = await cardArt(scene.card);
  const fadeOut = (duration - FADE).toFixed(2);
  const filter = [
    `[0:v]format=rgb24[bg]`,
    `[1:v]format=rgba,fade=t=in:st=0:d=0.6:alpha=1,fade=t=out:st=${fadeOut}:d=${FADE}:alpha=1[card]`,
    `[bg][card]overlay=0:0:shortest=1,format=yuv420p[v]`,
    audioChain(2, duration),
  ].join(';');
  sh('ffmpeg', [
    '-y', '-loglevel', 'error', '-stats',
    '-loop', '1', '-i', bg, '-loop', '1', '-i', card, '-i', voiceFile,
    '-filter_complex', filter, '-map', '[v]', '-map', '[a]', ...encodeArgs(duration, out),
  ]);
  return out;
}

async function assemble() {
  const durFile = join(DIRS.voice, 'durations.json');
  const durations = existsSync(durFile) ? JSON.parse(readFileSync(durFile, 'utf8')) : voice();
  const bg = await background();
  // Phone slot geometry comes from the first capture (or still) present.
  const sample =
    SCENES.map((s) => (s.kind === 'recording' ? join(DIRS.capture, `${s.id}.mp4`) : s.kind === 'still' ? join(ROOT, s.still) : null)).find(
      (f) => f && existsSync(f),
    );
  const size = probeSize(sample);
  const ph = PHONE_H;
  const pw = Math.round((ph * size.w) / size.h / 2) * 2;
  const art = { ...(await phoneArt(bg, pw, ph)), pw, ph };

  const segments = [];
  let total = 0;
  for (const scene of SCENES) {
    const voiceFile = join(DIRS.voice, `${scene.id}.aiff`);
    const spoken = durations[scene.id] + VO_DELAY + scene.tail;
    // A flow that runs longer than its narration keeps its footage; the
    // voice just ends early.
    const footage = scene.kind === 'recording' ? captureMeta(scene).footage : 0;
    scene.speed = footage > spoken ? Math.min(MAX_SPEEDUP, footage / spoken) : 1;
    const duration = Number(Math.max(spoken, footage / scene.speed).toFixed(2));
    total += duration;
    console.log(`▶ ${scene.id} ${duration}s${scene.speed > 1 ? ` (footage ×${scene.speed.toFixed(2)})` : ''}`);
    segments.push(
      scene.kind === 'card' ? await segmentCard(scene, duration, bg, voiceFile) : await segmentPhone(scene, duration, art, voiceFile),
    );
  }
  const list = join(DIRS.segments, 'list.txt');
  writeFileSync(list, segments.map((s) => `file '${s}'`).join('\n'));
  const joined = join(DIRS.segments, 'joined.mp4');
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);

  const music = opt('music');
  if (music) {
    const fadeAt = Math.max(0, total - 4).toFixed(2);
    sh('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', joined, '-stream_loop', '-1', '-i', resolve(music),
      '-filter_complex',
      `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.10,afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeAt}:d=4[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`,
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(total), FINAL,
    ]);
  } else {
    sh('cp', [joined, FINAL]);
  }
  const length = probeDuration(FINAL);
  console.log(`\n✓ ${FINAL} — ${length.toFixed(1)}s${length > 120 ? '  ⚠ OVER the 2-minute limit' : ''}`);
}

/* ------------------------------------------------------------------ main */

const run = async () => {
  switch (cmd) {
    case 'voice':
      voice();
      break;
    case 'setup':
      await setup(bootedSim());
      break;
    case 'record':
      await record(bootedSim());
      break;
    case 'assemble':
      await assemble();
      break;
    case 'art': {
      // Preview the rendered layers without any capture: demo/out/art/*.png
      const bg = await background();
      const still = SCENES.find((s) => s.kind === 'still');
      const size = probeSize(join(ROOT, still.still));
      const pw = Math.round((PHONE_H * size.w) / size.h / 2) * 2;
      const art = { ...(await phoneArt(bg, pw, PHONE_H)), pw, ph: PHONE_H };
      for (const scene of SCENES) {
        if (scene.kind === 'card') await cardArt(scene.card);
        else await captionArt(scene, art.px - 150 - 90);
      }
      // One composed preview frame of the still scene, for a quick look.
      const phone = await sharp(join(ROOT, still.still)).resize(pw, PHONE_H).toBuffer();
      const masked = await sharp(phone).composite([{ input: art.mask, blend: 'dest-in' }]).png().toBuffer();
      await sharp(art.bgPhone)
        .composite([
          { input: masked, left: art.px, top: PHONE_Y },
          { input: join(DIRS.art, `${still.id}-caption.png`) },
        ])
        .png()
        .toFile(join(DIRS.art, 'preview-still.png'));
      console.log(`art in ${DIRS.art}`);
      break;
    }
    case 'all': {
      const udid = bootedSim();
      voice();
      await record(udid);
      await assemble();
      break;
    }
    default:
      console.error('usage: demo-video.mjs voice | setup | record [--only id] | assemble [--music f] | art | all');
      process.exit(1);
  }
};

run().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
