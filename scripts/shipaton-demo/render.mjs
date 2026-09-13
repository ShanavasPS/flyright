#!/usr/bin/env node
/** Local, repeatable production pipeline. No video or text leaves this Mac. */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = process.env.DEMO_OUT || join(HERE, 'output');
const board = JSON.parse(await readFile(join(HERE, 'storyboard.json'), 'utf8'));
const phase = process.argv[2] || 'all';
// Keep the complete display inside a rounded, proportionate iPhone enclosure.
// The capture includes its native Dynamic Island and home indicator.
const phone = { x: 1340, y: 52, width: 450, height: 978, radius: 60, bezel: 12 };
const ffmpeg = process.env.FFMPEG || [
  'ffmpeg',
  '/opt/homebrew/bin/ffmpeg',
  join(homedir(), 'Library/Caches/Cypress/13.14.2/Cypress.app/Contents/Resources/app/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg'),
].find((candidate) => {
  const probe = spawnSync(candidate, ['-hide_banner', '-filters'], { encoding: 'utf8' });
  return probe.status === 0 && /\bsubtitles\b/.test(probe.stdout);
});
if (!ffmpeg) throw new Error('Set FFMPEG to an FFmpeg build with libass/subtitles support.');
const total = board.scenes.reduce((sum, scene) => sum + scene.duration, 0);
if (total !== board.duration || total >= 120) throw new Error('Storyboard must fit below two minutes.');
for (const sub of ['audio', 'graphics', 'segments', 'raw', 'stills']) await mkdir(join(OUT, sub), { recursive: true });
const xml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const assTime = (s) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
const srtTime = (s) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${(s % 60).toFixed(3).padStart(6, '0').replace('.', ',')}`;
const timestamp = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function run(command, args) {
  const p = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
  if (p.error || p.status !== 0) throw new Error(`${command}: ${p.error?.message || p.stderr || p.stdout}`);
  return p.stdout;
}
function duration(path) {
  const p = spawnSync(ffmpeg, ['-hide_banner', '-i', path], { encoding: 'utf8' });
  const m = p.stderr?.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  if (!m) throw new Error(`Cannot read duration: ${path}\n${p.stderr}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
function captionChunks(text) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  return sentences.flatMap((sentence) => {
    const words = sentence.trim().split(/\s+/);
    const n = Math.ceil(words.length / 11);
    const size = Math.ceil(words.length / n);
    return Array.from({ length: n }, (_, i) => words.slice(i * size, (i + 1) * size).join(' '));
  });
}
const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Helvetica Neue,34,&H00FFFFFF,&H00FFFFFF,&H000A1830,&H000A1830,0,0,0,0,100,100,0,0,1,0,0,4,122,708,0,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

if (phase === 'all' || phase === 'prepare') {
  const mask = `<svg width="${phone.width}" height="${phone.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="black"/><rect width="100%" height="100%" rx="${phone.radius}" fill="white"/></svg>`;
  await sharp(Buffer.from(mask)).removeAlpha().png().toFile(join(OUT, 'graphics', 'screen-mask.png'));
  let start = 0;
  const rows = [];
  let script = '# FlyRight — 1:59 Shipaton demo\n\nEnglish narration. Category focus: RevenueCat Design Award (editorial default; change the final scene if entering different categories).\n\n';
  for (const [index, scene] of board.scenes.entries()) {
    const icon = await sharp(join(ROOT, 'assets/images/icon.png')).resize(70, 70).png().toBuffer();
    const headline = scene.headline.map((line, i) => `<text x="96" y="${361 + i * 110}" font-size="92" font-weight="700" letter-spacing="-3">${xml(line)}</text>`).join('');
    const bullets = scene.bullets.map((line, i) => `<circle cx="108" cy="${607 + i * 62}" r="5" fill="#64B7FF"/><text x="135" y="${620 + i * 62}" font-size="33" fill="#C7D7ED">${xml(line)}</text>`).join('');
    const dots = board.scenes.map((_, i) => `<rect x="${96 + i * 37}" y="1024" width="${i === index ? 25 : 9}" height="6" rx="3" fill="${i === index ? '#77C7FF' : '#3C5377'}"/>`).join('');
    const svg = `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="sky" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#08162D"/><stop offset=".6" stop-color="#122C50"/><stop offset="1" stop-color="#20497A"/></linearGradient><radialGradient id="glow"><stop stop-color="#418FF5" stop-opacity=".2"/><stop offset="1" stop-color="#418FF5" stop-opacity="0"/></radialGradient><linearGradient id="metal" x1="0" y1="0" x2="1" y2=".4"><stop stop-color="#81909C"/><stop offset=".13" stop-color="#303B46"/><stop offset=".6" stop-color="#111820"/><stop offset="1" stop-color="#697583"/></linearGradient></defs>
      <rect width="1920" height="1080" fill="url(#sky)"/><ellipse cx="1515" cy="500" rx="650" ry="750" fill="url(#glow)"/>
      <path d="M -100 700 Q 650 60 1930 250 M -80 750 Q 900 1200 1930 590" stroke="#8ABFFC" stroke-opacity=".08" stroke-width="2" fill="none" stroke-dasharray="4 14"/>
      <g font-family="Helvetica Neue, Helvetica, Arial, sans-serif" fill="#FFFFFF">
        <image href="data:image/png;base64,${icon.toString('base64')}" x="96" y="65" width="70" height="70"/>
        <text x="185" y="113" font-size="43" font-weight="650">FlyRight</text>
        <text x="96" y="253" font-size="22" fill="#87C5FF" letter-spacing="3">${xml(scene.chapter)}</text>
        ${headline}${bullets}
        ${scene.note ? `<text x="96" y="803" font-size="19" fill="#96ADCA">${xml(scene.note)}</text>` : ''}
        <rect x="96" y="859" width="1094" height="119" rx="22" fill="#07162C" fill-opacity=".64"/>
        ${dots}<text x="1168" y="1034" text-anchor="end" font-size="18" fill="#A8BEDA">SHIPATON 2026</text>
        <rect x="${phone.x - 16}" y="${phone.y - 7}" width="${phone.width + 32}" height="${phone.height + 24}" rx="77" fill="#020812" fill-opacity=".28"/>
        <g fill="url(#metal)" stroke="#0E1620" stroke-width="1">
          <rect x="${phone.x - 17}" y="196" width="7" height="32" rx="3"/>
          <rect x="${phone.x - 17}" y="255" width="7" height="65" rx="3"/>
          <rect x="${phone.x - 17}" y="337" width="7" height="65" rx="3"/>
          <rect x="${phone.x + phone.width + 10}" y="289" width="7" height="98" rx="3"/>
          <rect x="${phone.x + phone.width + 10}" y="724" width="6" height="62" rx="3"/>
          <rect x="${phone.x - phone.bezel}" y="${phone.y - phone.bezel}" width="${phone.width + phone.bezel * 2}" height="${phone.height + phone.bezel * 2}" rx="${phone.radius + phone.bezel}"/>
        </g>
        <rect x="${phone.x - 9}" y="${phone.y - 9}" width="${phone.width + 18}" height="${phone.height + 18}" rx="${phone.radius + 9}" fill="#050608" stroke="#AFB8C0" stroke-opacity=".35" stroke-width="1"/>
      </g>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(join(OUT, 'graphics', `${scene.id}.png`));
    await writeFile(join(OUT, 'audio', `${scene.id}.txt`), scene.narration + '\n');
    rows.push(`| ${timestamp(start)}–${timestamp(start + scene.duration)} | ${scene.chapter} | ${scene.bullets.join('; ')} |`);
    script += `## ${timestamp(start)}–${timestamp(start + scene.duration)} — ${scene.chapter}\n\n${scene.narration}\n\n`;
    start += scene.duration;
  }
  await writeFile(join(HERE, 'NARRATION.md'), script);
  await writeFile(join(HERE, 'TIMELINE.md'), `# 1:59 demo timeline\n\n| Time | Scene | What the viewer sees |\n| --- | --- | --- |\n${rows.join('\n')}\n`);
  console.log('Prepared branded backgrounds, timed script, and narration text.');
}

if (phase === 'all' || phase === 'voice') {
  const timings = {};
  for (const scene of board.scenes) {
    const textPath = join(OUT, 'audio', `${scene.id}.txt`);
    const audioPath = join(OUT, 'audio', `${scene.id}.aiff`);
    const voice = process.env.DEMO_VOICE || board.voice;
    let rate = board.voiceRate;
    run('say', ['-v', voice, '-r', String(rate), '-f', textPath, '-o', audioPath]);
    const measured = duration(audioPath);
    if (measured < 0.1) throw new Error('Speech synthesis produced no audio; allow access to the macOS speech service.');
    const target = scene.duration - 1.0;
    const adjustedRate = Math.max(135, Math.min(195, Math.round(rate * measured / target)));
    if (Math.abs(adjustedRate - rate) > 4) {
      rate = adjustedRate;
      run('say', ['-v', voice, '-r', String(rate), '-f', textPath, '-o', audioPath]);
    }
    let finalDuration = duration(audioPath);
    // Speech timing is nonlinear: punctuation and pronunciation affect it.
    // Leave a small tail instead of ever cutting off the last spoken word.
    for (let attempt = 0; finalDuration > scene.duration - 0.55 && attempt < 3; attempt++) {
      rate = Math.ceil(rate * finalDuration / (scene.duration - 0.85)) + 2;
      run('say', ['-v', voice, '-r', String(rate), '-f', textPath, '-o', audioPath]);
      finalDuration = duration(audioPath);
    }
    if (finalDuration > scene.duration - 0.45) throw new Error(`${scene.id}: voice too long (${finalDuration}s); shorten narration.`);
    timings[scene.id] = { duration: finalDuration, voice, rate };
    console.log(`${scene.id}: ${finalDuration.toFixed(2)}s speech in ${scene.duration}s scene (${voice}, ${rate} wpm)`);
  }
  await writeFile(join(OUT, 'audio', 'timings.json'), JSON.stringify(timings, null, 2));
}

if (phase === 'all' || phase === 'render') {
  const timings = JSON.parse(await readFile(join(OUT, 'audio', 'timings.json'), 'utf8'));
  const srt = [];
  let start = 0;
  const selected = process.env.DEMO_SCENES?.split(',');
  for (const scene of board.scenes) {
    const chunks = captionChunks(scene.narration.replaceAll('Fly Right', 'FlyRight').replaceAll('Revenue Cat', 'RevenueCat'));
    const words = chunks.reduce((sum, s) => sum + s.split(' ').length, 0);
    const speechDuration = timings[scene.id].duration;
    let at = 0.35;
    const events = [];
    for (const chunk of chunks) {
      const end = at + speechDuration * chunk.split(' ').length / words;
      // Wrap two lines inside the left caption panel; never cover app footage.
      const w = chunk.split(' ');
      const midpoint = chunk.length > 58 ? Math.ceil(w.length / 2) : w.length;
      const formatted = w.slice(0, midpoint).join(' ') + (midpoint < w.length ? '\\N' + w.slice(midpoint).join(' ') : '');
      events.push(`Dialogue: 0,${assTime(at)},${assTime(end)},Default,,0,0,0,,{\\an4\\pos(122,918)\\fad(90,90)}${formatted}`);
      srt.push(`${srt.length + 1}\n${srtTime(start + at)} --> ${srtTime(start + end)}\n${chunk}\n`);
      at = end;
    }
    const assPath = join(OUT, 'graphics', `${scene.id}.ass`);
    await writeFile(assPath, assHeader + events.join('\n') + '\n');
    start += scene.duration;
    if (selected && !selected.includes(scene.id)) continue;
    const raw = join(OUT, 'raw', `${scene.id}.mp4`);
    if (!existsSync(raw)) throw new Error(`Missing actual recording: ${raw}. Run record.sh first.`);
    const rawDuration = duration(raw);
    const speed = Math.min(1, scene.duration / rawDuration);
    const subtitles = assPath.replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "\\'");
    const filter = `[1:v]setpts=${speed}*(PTS-STARTPTS),fps=30,scale=${phone.width}:${phone.height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${phone.width}:${phone.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,tpad=stop_mode=clone:stop_duration=${scene.duration},trim=duration=${scene.duration},format=rgba[screen];[3:v]format=gray[mask];[screen][mask]alphamerge[phone];[0:v][phone]overlay=${phone.x}:${phone.y}:shortest=1,subtitles='${subtitles}'[v];[2:a]aformat=channel_layouts=mono,loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000,aformat=channel_layouts=mono,adelay=350,apad,atrim=duration=${scene.duration}[a]`;
    console.log(`Rendering ${scene.id} (${rawDuration.toFixed(2)}s capture → ${scene.duration}s edit)...`);
    run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-loop', '1', '-framerate', '30', '-i', join(OUT, 'graphics', `${scene.id}.png`), '-i', raw, '-i', join(OUT, 'audio', `${scene.id}.aiff`), '-loop', '1', '-framerate', '30', '-i', join(OUT, 'graphics', 'screen-mask.png'), '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-t', String(scene.duration), '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', join(OUT, 'segments', `${scene.id}.mp4`)]);
  }
  await writeFile(join(OUT, 'flyright-shipaton.srt'), srt.join('\n'));
  const concat = join(OUT, 'segments', 'concat.txt');
  await writeFile(concat, board.scenes.map((s) => `file '${join(OUT, 'segments', `${s.id}.mp4`).replaceAll("'", "'\\''")}'`).join('\n') + '\n');
  const final = join(OUT, 'flyright-shipaton-1m59s.mp4');
  run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concat, '-c', 'copy', '-movflags', '+faststart', final]);
  run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', final, '-vn', '-c:a', 'pcm_s16le', join(OUT, 'voiceover.wav')]);
  const finalDuration = duration(final);
  if (Math.abs(finalDuration - total) > 0.15 || finalDuration >= 120) throw new Error(`Unexpected final duration: ${finalDuration}`);
  // Decode the entire final video, detecting corrupt frames or muxing errors.
  run(ffmpeg, ['-v', 'error', '-i', final, '-f', 'null', '-']);
  console.log(`Verified final: ${finalDuration.toFixed(2)}s, 1920×1080, H.264/AAC. ${final}`);
}
