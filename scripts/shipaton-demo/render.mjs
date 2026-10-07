#!/usr/bin/env node
/** Local, repeatable production pipeline. No video or text leaves this Mac. */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = process.env.DEMO_OUT || join(HERE, 'output');
// DEMO_BOARD names a different storyboard beside this one — the device cut
// is a second edit of the same app, from a phone recording rather than the
// simulator, so it carries its own scenes and its own length.
const board = JSON.parse(await readFile(join(HERE, process.env.DEMO_BOARD || 'storyboard.json'), 'utf8'));
const phase = process.argv[2] || 'all';
// DEMO_STYLE=story swaps the left panel for scripts/shipaton-demo/panel-story.mjs
// (background, caption style, moving overlays); footage and voice are untouched.
const style = process.env.DEMO_STYLE ? await import(`./panel-${process.env.DEMO_STYLE}.mjs`) : null;
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
const assHeader = style?.assHeader ?? `[Script Info]
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
  let script = '# FlyRight — 1:59 Shipaton demo\n\nEnglish narration. The cut leads with the free-versus-Pro boundary and the craft behind it; the closing scene names no single category, so it suits every entry.\n\n';
  for (const [index, scene] of board.scenes.entries()) {
    const icon = await sharp(join(ROOT, 'assets/images/icon.png')).resize(70, 70).png().toBuffer();
    const headline = scene.headline.map((line, i) => `<text x="96" y="${361 + i * 110}" font-size="92" font-weight="700" letter-spacing="-3">${xml(line)}</text>`).join('');
    const bullets = scene.bullets.map((line, i) => `<circle cx="108" cy="${607 + i * 62}" r="5" fill="#64B7FF"/><text x="135" y="${620 + i * 62}" font-size="33" fill="#C7D7ED">${xml(line)}</text>`).join('');
    const dots = board.scenes.map((_, i) => `<rect x="${96 + i * 37}" y="1024" width="${i === index ? 25 : 9}" height="6" rx="3" fill="${i === index ? '#77C7FF' : '#3C5377'}"/>`).join('');
    const svg = style ? await style.background({ scene, index, scenes: board.scenes, start, total, phone, board }) : `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="sky" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#08162D"/><stop offset=".6" stop-color="#122C50"/><stop offset="1" stop-color="#20497A"/></linearGradient><radialGradient id="glow"><stop stop-color="#418FF5" stop-opacity=".2"/><stop offset="1" stop-color="#418FF5" stop-opacity="0"/></radialGradient><linearGradient id="metal" x1="0" y1="0" x2="1" y2=".4"><stop stop-color="#81909C"/><stop offset=".13" stop-color="#303B46"/><stop offset=".6" stop-color="#111820"/><stop offset="1" stop-color="#697583"/></linearGradient></defs>
      <rect width="1920" height="1080" fill="url(#sky)"/><ellipse cx="1515" cy="500" rx="650" ry="750" fill="url(#glow)"/>
      <path d="M -100 700 Q 650 60 1930 250 M -80 750 Q 900 1200 1930 590" stroke="#8ABFFC" stroke-opacity=".08" stroke-width="2" fill="none" stroke-dasharray="4 14"/>
      <g font-family="Helvetica Neue, Helvetica, Arial, sans-serif" fill="#FFFFFF">
        <image href="data:image/png;base64,${icon.toString('base64')}" x="96" y="65" width="70" height="70"/>
        <text x="185" y="113" font-size="43" font-weight="650">FlyRight</text>
        <text x="96" y="253" font-size="22" fill="#87C5FF" letter-spacing="3">${xml(scene.chapter)}</text>
        ${headline}${bullets}
        ${scene.note ? `<text x="96" y="803" font-size="19" fill="#96ADCA">${xml(scene.note)}</text>` : ''}
        ${(scene.images ?? []).map((im) => `<image href="data:image/png;base64,${readFileSync(join(HERE, im.src)).toString('base64')}" x="${im.x}" y="${im.y}" width="${im.width}" height="${im.height}"/>`).join('')}
        ${(scene.labels ?? []).map((l) => `<text x="${l.x}" y="${l.y}" font-size="${l.size ?? 26}" font-weight="${l.weight ?? 600}" fill="${l.fill ?? '#FFFFFF'}">${xml(l.text)}</text>`).join('')}
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
    // `speech` is what the voice reads when it differs from the caption: it may
    // carry ElevenLabs pause tags such as <break time="0.6s" />.
    await writeFile(join(OUT, 'audio', `${scene.id}.txt`), (scene.speech ?? scene.narration) + '\n');
    rows.push(`| ${timestamp(start)}–${timestamp(start + scene.duration)} | ${scene.chapter} | ${scene.bullets.join('; ')} |`);
    script += `## ${timestamp(start)}–${timestamp(start + scene.duration)} — ${scene.chapter}\n\n${scene.narration}\n\n`;
    start += scene.duration;
  }
  await writeFile(join(HERE, 'NARRATION.md'), script);
  await writeFile(join(HERE, 'TIMELINE.md'), `# 1:59 demo timeline\n\n| Time | Scene | What the viewer sees |\n| --- | --- | --- |\n${rows.join('\n')}\n`);
  console.log('Prepared branded backgrounds, timed script, and narration text.');
}

/** Integrated loudness of a voice file in LUFS, from ffmpeg's measurement pass. */
function lufs(path) {
  const probe = spawnSync(ffmpeg, ['-hide_banner', '-nostats', '-i', path, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  const match = /"input_i"\s*:\s*"([-\d.]+)"/.exec(probe.stderr);
  if (!match) throw new Error(`Could not measure loudness of ${path}`);
  return Number(match[1]);
}

// macOS `say` is the default. DEMO_TTS=edge speaks through Microsoft's neural
// voices instead (edge-tts on PATH or EDGE_TTS_BIN; DEMO_VOICE names the
// voice, e.g. en-US-AndrewNeural): the first Shipaton cut used it because
// Samantha reads a script like a timetable. DEMO_TTS=elevenlabs uses the
// ElevenLabs API (ELEVENLABS_API_KEY; DEMO_VOICE is a voice id or a premade
// voice's name, DEMO_MODEL the model) and keeps the character alignment it
// returns, so captions follow the spoken words instead of a word count.
// The rate loop below still thinks in words per minute; edge maps that onto
// its percentage rate and ElevenLabs onto its `speed` setting, both against
// the storyboard's base rate, so the fitting logic is shared.
const edge = process.env.DEMO_TTS === 'edge';
const eleven = process.env.DEMO_TTS === 'elevenlabs';
const edgeBin = process.env.EDGE_TTS_BIN || 'edge-tts';
const elevenApi = 'https://api.elevenlabs.io/v1';
const elevenModel = process.env.DEMO_MODEL || 'eleven_multilingual_v2';
function elevenKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('Set ELEVENLABS_API_KEY for DEMO_TTS=elevenlabs.');
  return key;
}
let elevenVoices;
async function elevenVoiceId(voice) {
  if (/^[A-Za-z0-9]{20}$/.test(voice)) return voice;
  if (!elevenVoices) {
    const res = await fetch(`${elevenApi}/voices`, { headers: { 'xi-api-key': elevenKey() } });
    if (!res.ok) throw new Error(`ElevenLabs voices: ${res.status} ${await res.text()}`);
    elevenVoices = (await res.json()).voices;
  }
  // Premade names carry a descriptor ("George - Warm, Captivating Storyteller").
  const match = elevenVoices.find((v) => v.name.toLowerCase().split(' - ')[0].trim() === voice.toLowerCase());
  if (!match) throw new Error(`ElevenLabs has no voice named "${voice}". Available: ${elevenVoices.map((v) => v.name).join(', ')}`);
  return match.voice_id;
}
/** Word timings from ElevenLabs' character alignment, in seconds from the start of the file. */
function wordsFromAlignment(alignment) {
  const words = [];
  let current = null;
  alignment.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (current) { words.push(current); current = null; } return; }
    if (!current) current = { word: '', start: alignment.character_start_times_seconds[i], end: 0 };
    current.word += ch;
    current.end = alignment.character_end_times_seconds[i];
  });
  if (current) words.push(current);
  // Pause tags come back in the alignment as characters; they are not words.
  return words.filter((w) => !/^<|\/>$|^time=/.test(w.word));
}
async function synth(voice, wpm, textPath, audioPath, settings = {}) {
  if (eleven) {
    // Every synthesis costs credits, so identical requests come from a cache.
    const text = (await readFile(textPath, 'utf8')).trim();
    const speed = Math.max(0.7, Math.min(1.2, Math.round((wpm / board.voiceRate) * 100) / 100));
    const voiceId = await elevenVoiceId(voice);
    const { createHash } = await import('node:crypto');
    const voiceSettings = { stability: Number(process.env.DEMO_STABILITY || 0.6), similarity_boost: 0.75, style: Number(process.env.DEMO_STYLE_EXAGGERATION || 0), use_speaker_boost: true, ...settings, speed };
    const key = createHash('sha1').update([voiceId, elevenModel, JSON.stringify(voiceSettings), text].join('\u0000')).digest('hex').slice(0, 16);
    const cacheDir = join(OUT, 'audio', 'cache');
    await mkdir(cacheDir, { recursive: true });
    const mp3 = join(cacheDir, `${key}.mp3`);
    const meta = join(cacheDir, `${key}.json`);
    if (!existsSync(mp3) || !existsSync(meta)) {
      const res = await fetch(`${elevenApi}/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': elevenKey(), 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: elevenModel, voice_settings: voiceSettings }),
      });
      if (!res.ok) throw new Error(`ElevenLabs text-to-speech: ${res.status} ${await res.text()}`);
      const body = await res.json();
      await writeFile(mp3, Buffer.from(body.audio_base64, 'base64'));
      await writeFile(meta, JSON.stringify({ voiceId, model: elevenModel, speed, words: wordsFromAlignment(body.alignment) }));
      console.log(`  ElevenLabs: ${text.length} characters at speed ${speed}`);
    }
    run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', mp3, '-ar', '48000', '-ac', '1', audioPath]);
    await writeFile(audioPath.replace(/\.aiff$/, '.words.json'), JSON.stringify(JSON.parse(await readFile(meta, 'utf8')).words));
    return;
  }
  if (!edge) return run('say', ['-v', voice, '-r', String(wpm), '-f', textPath, '-o', audioPath]);
  const pct = Math.round((wpm / board.voiceRate - 1) * 100);
  const mp3 = audioPath.replace(/\.aiff$/, '.mp3');
  run(edgeBin, ['--voice', voice, `--rate=${pct >= 0 ? '+' : ''}${pct}%`, '-f', textPath, '--write-media', mp3]);
  run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', mp3, '-ar', '48000', '-ac', '1', audioPath]);
}

if (phase === 'all' || phase === 'voice') {
  const timings = {};
  for (const scene of board.scenes) {
    const textPath = join(OUT, 'audio', `${scene.id}.txt`);
    const audioPath = join(OUT, 'audio', `${scene.id}.aiff`);
    const voice = process.env.DEMO_VOICE || board.voice;
    // A scene may pin its pace (`voiceSpeed`, 1 = natural) and pass its own
    // ElevenLabs settings (`voiceSettings`): the close is read at natural
    // speed with more expression instead of being slowed to fill its scene.
    const fixed = scene.voiceSpeed ? Math.round(board.voiceRate * scene.voiceSpeed) : null;
    const settings = scene.voiceSettings ?? {};
    let rate = fixed ?? board.voiceRate;
    await synth(voice, rate, textPath, audioPath, settings);
    const measured = duration(audioPath);
    if (measured < 0.1) throw new Error('Speech synthesis produced no audio; allow access to the macOS speech service.');
    const target = scene.duration - 1.0;
    const adjustedRate = Math.max(135, Math.min(195, Math.round(rate * measured / target)));
    if (!fixed && Math.abs(adjustedRate - rate) > 4) {
      rate = adjustedRate;
      await synth(voice, rate, textPath, audioPath, settings);
    }
    let finalDuration = duration(audioPath);
    // Speech timing is nonlinear: punctuation and pronunciation affect it.
    // Leave a small tail instead of ever cutting off the last spoken word.
    for (let attempt = 0; finalDuration > scene.duration - 0.55 && attempt < 3; attempt++) {
      rate = Math.ceil(rate * finalDuration / (scene.duration - 0.85)) + 2;
      await synth(voice, rate, textPath, audioPath, settings);
      finalDuration = duration(audioPath);
    }
    if (finalDuration > scene.duration - 0.45) throw new Error(`${scene.id}: voice too long (${finalDuration}s); shorten narration.`);
    const wordsPath = audioPath.replace(/\.aiff$/, '.words.json');
    timings[scene.id] = { duration: finalDuration, voice, rate, ...(existsSync(wordsPath) ? { words: JSON.parse(await readFile(wordsPath, 'utf8')) } : {}) };
    console.log(`${scene.id}: ${finalDuration.toFixed(2)}s speech in ${scene.duration}s scene (${voice}, ${rate} wpm)`);
  }
  await writeFile(join(OUT, 'audio', 'timings.json'), JSON.stringify(timings, null, 2));
}

/**
 * DEMO_MUSIC=<file> lays a music bed under the narration in the final
 * assembly: trimmed to the film, faded in and out, levelled to DEMO_MUSIC_LUFS
 * (default -30) and ducked a further few dB whenever the voice speaks, via a
 * sidechain compressor keyed on the narration. The voice is untouched; a
 * limiter holds the mix's peak where the scenes were levelled.
 */
function musicChain(voiceLabel, musicInput, totalSeconds) {
  const target = Number(process.env.DEMO_MUSIC_LUFS || -29);
  const gain = Math.max(-40, Math.min(20, target - lufs(process.env.DEMO_MUSIC)));
  // DEMO_MUSIC_START skips a composed track's quiet intro so the bed is
  // audible from the first frame; the fades are only long enough to avoid
  // clicks at the start and a bump at the end, and the bed is padded with
  // silence if the trimmed track runs out before the film does.
  const start = Number(process.env.DEMO_MUSIC_START || 0);
  const available = Math.min(totalSeconds, duration(process.env.DEMO_MUSIC) - start);
  const fadeOut = Math.min(4, available);
  // A gentle dip, about 6 dB on speech peaks: the threshold sits at -14 dBFS,
  // just under the levelled voice, and the ratio is low. The first setting
  // (-34 dBFS, ratio 6) took the bed down by 25 dB on every word.
  const duckThreshold = Number(process.env.DEMO_DUCK_THRESHOLD || 0.2);
  const duckRatio = Number(process.env.DEMO_DUCK_RATIO || 2.5);
  // sidechaincompress wants both inputs in one format; it cannot pick one itself.
  const fmt = 'aformat=sample_fmts=dbl:sample_rates=48000:channel_layouts=mono';
  return `${voiceLabel}asplit[vmain][vkey];` +
    `[${musicInput}:a]aformat=channel_layouts=mono,aresample=48000,atrim=start=${start}:duration=${available.toFixed(3)},asetpts=PTS-STARTPTS,` +
    `afade=t=in:st=0:d=0.4,afade=t=out:st=${(available - fadeOut).toFixed(2)}:d=${fadeOut},apad,atrim=duration=${totalSeconds},volume=${gain.toFixed(2)}dB,${fmt}[bed];` +
    `[vkey]${fmt}[key];[bed][key]sidechaincompress=threshold=${duckThreshold}:ratio=${duckRatio}:attack=60:release=900:makeup=1[ducked];` +
    `[vmain][ducked]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.841:level=false[a]`;
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
    // With ElevenLabs' alignment, a caption appears with its first spoken
    // word and leaves just after its last; otherwise its share of the
    // measured speech is estimated from its word count.
    const spoken = timings[scene.id].words;
    const aligned = spoken && spoken.length === words ? spoken : null;
    let at = 0.35;
    let wordIndex = 0;
    const events = [];
    for (const chunk of chunks) {
      const count = chunk.split(' ').length;
      let end;
      if (aligned) {
        at = Math.max(at, 0.35 + aligned[wordIndex].start - 0.05);
        end = Math.min(0.35 + aligned[wordIndex + count - 1].end + 0.2, scene.duration - 0.05);
        wordIndex += count;
      } else {
        end = at + speechDuration * count / words;
      }
      // Wrap two lines inside the left caption panel; never cover app footage.
      const w = chunk.split(' ');
      const midpoint = chunk.length > 58 ? Math.ceil(w.length / 2) : w.length;
      const formatted = w.slice(0, midpoint).join(' ') + (midpoint < w.length ? '\\N' + w.slice(midpoint).join(' ') : '');
      events.push(`Dialogue: 0,${assTime(at)},${assTime(end)},Default,,0,0,0,,${style?.captionTag ?? '{\\an4\\pos(122,918)\\fad(90,90)}'}${formatted}`);
      srt.push(`${srt.length + 1}\n${srtTime(start + at)} --> ${srtTime(start + end)}\n${chunk}\n`);
      at = end;
    }
    const assPath = join(OUT, 'graphics', `${scene.id}.ass`);
    await writeFile(assPath, assHeader + events.join('\n') + '\n');
    const sceneStart = start;
    start += scene.duration;
    if (selected && !selected.includes(scene.id)) continue;
    const raw = join(OUT, 'raw', `${scene.id}.mp4`);
    if (!existsSync(raw)) throw new Error(`Missing actual recording: ${raw}. Run record.sh first.`);
    const rawDuration = duration(raw);
    const speed = Math.min(1, scene.duration / rawDuration);
    const subtitles = assPath.replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "\\'");
    // Level each scene by a measured gain, not by loudnorm inside the filter:
    // single-pass loudnorm needs a few seconds of programme to settle, and a
    // four-second scene with two seconds of speech came out 17 dB under its
    // neighbours — the "sound drops" in the first Maja cut. Measure the
    // integrated loudness of the voice file, lift it to -16 LUFS, and let a
    // limiter hold the peak at -1.5 dBTP. Every scene lands at the same level.
    const gainDb = Math.max(-20, Math.min(30, -16 - lufs(join(OUT, 'audio', `${scene.id}.aiff`))));
    // A style may add moving overlays (the story panel's plane on its
    // progress track); each is one more looped image input after the mask.
    const extras = style?.overlays ? await style.overlays({ scene, start: sceneStart, total, out: OUT }) : [];
    // DEMO_MOVIE: a generated clip of the scene (movie/<id>.mp4) plays in the
    // panel's film window, cropped to fill it under a rounded mask. A clip
    // longer than the scene is cut; a shorter one is slowed by up to a
    // quarter and then holds its last frame. A scene without a clip keeps
    // the empty window.
    const movie = style?.MOVIE && existsSync(join(OUT, 'movie', `${scene.id}.mp4`)) ? join(OUT, 'movie', `${scene.id}.mp4`) : null;
    if (movie) {
      const W = style.WINDOW;
      const clipLen = duration(movie);
      const slow = Math.max(1, Math.min(1.33, scene.duration / clipLen));
      extras.unshift({ movie: true, path: movie, x: W.x, y: W.y, filter: `setpts=${slow.toFixed(4)}*(PTS-STARTPTS),fps=30,scale=${W.width}:${W.height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W.width}:${W.height},setsar=1,tpad=stop_mode=clone:stop_duration=${scene.duration},trim=duration=${scene.duration},format=rgba[mv];[${'MASK'}:v]format=gray[mvmask];[mv][mvmask]alphamerge` });
      await sharp(Buffer.from(style.movieWindowMask())).removeAlpha().png().toFile(join(OUT, 'graphics', 'window-mask.png'));
    }
    const extraInputs = extras.flatMap((o) => o.movie ? ['-i', o.path, '-loop', '1', '-framerate', '30', '-i', join(OUT, 'graphics', 'window-mask.png')] : ['-loop', '1', '-framerate', '30', '-i', o.path]);
    // Each overlay is a labelled step: the composed frame stays the main
    // input and the extra image is laid on top of it, never the other way.
    let inputIndex = 4;
    const extraChain = extras.map((o, i) => {
      if (o.movie) {
        const clip = inputIndex, mask = inputIndex + 1;
        inputIndex += 2;
        return `[${clip}:v]${o.filter.replace('MASK', String(mask))}[mvclip];[base${i}][mvclip]overlay=${o.x}:${o.y}:shortest=1[base${i + 1}];`;
      }
      return `[base${i}][${inputIndex++}:v]overlay=x='${o.x}':y=${o.y}:shortest=1[base${i + 1}];`;
    }).join('');
    const filter = `[1:v]setpts=${speed}*(PTS-STARTPTS),fps=30,scale=${phone.width}:${phone.height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${phone.width}:${phone.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,tpad=stop_mode=clone:stop_duration=${scene.duration},trim=duration=${scene.duration},format=rgba[screen];[3:v]format=gray[mask];[screen][mask]alphamerge[phone];[0:v][phone]overlay=${phone.x}:${phone.y}:shortest=1[base0];${extraChain}[base${extras.length}]subtitles='${subtitles}'[v];[2:a]aformat=channel_layouts=mono,volume=${gainDb.toFixed(2)}dB,alimiter=limit=0.841:level=false,aresample=48000,aformat=channel_layouts=mono,adelay=350,apad,atrim=duration=${scene.duration}[a]`;
    console.log(`Rendering ${scene.id} (${rawDuration.toFixed(2)}s capture → ${scene.duration}s edit)...`);
    run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-loop', '1', '-framerate', '30', '-i', join(OUT, 'graphics', `${scene.id}.png`), '-i', raw, '-i', join(OUT, 'audio', `${scene.id}.aiff`), '-loop', '1', '-framerate', '30', '-i', join(OUT, 'graphics', 'screen-mask.png'), ...extraInputs, '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-t', String(scene.duration), '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', join(OUT, 'segments', `${scene.id}.mp4`)]);
  }
  await writeFile(join(OUT, 'flyright-shipaton.srt'), srt.join('\n'));
  const concat = join(OUT, 'segments', 'concat.txt');
  await writeFile(concat, board.scenes.map((s) => `file '${join(OUT, 'segments', `${s.id}.mp4`).replaceAll("'", "'\\''")}'`).join('\n') + '\n');
  const final = join(OUT, process.env.DEMO_FINAL || 'flyright-shipaton-1m59s.mp4');
  const xfade = Number(process.env.DEMO_XFADE || 0);
  // A style may supply one continuous clip to lay over the whole film (the
  // story panel's plane and flown line, drawn at fractional positions).
  const strip = style?.trackStrip ? await style.trackStrip({ total, fps: 30, out: OUT, ffmpeg }) : null;
  if (strip) console.log(`Track strip: ${strip.frames} frames at (${strip.x}, ${strip.y}).`);
  if (xfade > 0) {
    // DEMO_XFADE=0.5 dissolves each scene into the next instead of cutting.
    // Every segment but the last is extended by holding its final frame for
    // the dissolve's length, so the next scene still starts exactly where
    // the hard cut was and the narration keeps its timing: the video is an
    // xfade chain over the held segments, the audio a plain concat of the
    // original ones. The total stays at the storyboard's length.
    const held = [];
    for (const [i, s] of board.scenes.entries()) {
      const seg = join(OUT, 'segments', `${s.id}.mp4`);
      if (i === board.scenes.length - 1) { held.push(seg); continue; }
      const out = join(OUT, 'segments', `${s.id}-held.mp4`);
      run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', seg, '-vf', `tpad=stop_mode=clone:stop_duration=${xfade}`, '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p', out]);
      held.push(out);
    }
    const n = board.scenes.length;
    const inputs = [...held, ...board.scenes.map((s) => join(OUT, 'segments', `${s.id}.mp4`))].flatMap((p) => ['-i', p]);
    let chain = '';
    let offset = 0;
    let prev = '[0:v]';
    for (let i = 1; i < n; i++) {
      offset += board.scenes[i - 1].duration;
      const label = i === n - 1 ? '[v]' : `[x${i}]`;
      chain += `${prev}[${i}:v]xfade=transition=fade:duration=${xfade}:offset=${offset}${label};`;
      prev = label;
    }
    // Each AAC segment decodes with a few ms of padding; trimmed to its
    // scene length, the narration lands exactly where the hard cut had it.
    chain += board.scenes.map((s, i) => `[${n + i}:a]atrim=duration=${s.duration},asetpts=PTS-STARTPTS[a${i}];`).join('');
    const music = process.env.DEMO_MUSIC;
    chain += board.scenes.map((_, i) => `[a${i}]`).join('') + `concat=n=${n}:v=0:a=1${music ? '[voice];' + musicChain('[voice]', 2 * n, total) : '[a]'}`;
    if (music) inputs.push('-i', music);
    if (strip) {
      inputs.push('-i', strip.path);
      chain = chain.replace('[v];', '[vx];') + `;[vx][${inputs.length / 2 - 1}:v]overlay=${strip.x}:${strip.y}:shortest=1[v]`;
    }
    console.log(`Dissolving ${n} scenes (${xfade}s each)${music ? ' with the music bed' : ''}...`);
    run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', chain, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', final]);
  } else if (process.env.DEMO_MUSIC || strip) {
    // Hard cuts, but the bed or the strip needs a second pass over the joined film.
    const cut = join(OUT, 'segments', 'cut.mp4');
    run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concat, '-c', 'copy', cut]);
    const inputs = ['-i', cut];
    const parts = [];
    if (process.env.DEMO_MUSIC) { inputs.push('-i', process.env.DEMO_MUSIC); parts.push(musicChain('[0:a]', inputs.length / 2 - 1, total)); }
    if (strip) { inputs.push('-i', strip.path); parts.push(`[0:v][${inputs.length / 2 - 1}:v]overlay=${strip.x}:${strip.y}:shortest=1[v]`); }
    run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', parts.join(';'), '-map', strip ? '[v]' : '0:v', '-map', process.env.DEMO_MUSIC ? '[a]' : '0:a', ...(strip ? ['-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p'] : ['-c:v', 'copy']), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', final]);
  } else {
    run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concat, '-c', 'copy', '-movflags', '+faststart', final]);
  }
  run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', final, '-vn', '-c:a', 'pcm_s16le', join(OUT, 'voiceover.wav')]);
  const finalDuration = duration(final);
  if (Math.abs(finalDuration - total) > 0.15 || finalDuration >= 120) throw new Error(`Unexpected final duration: ${finalDuration}`);
  // The frame size is asserted, not assumed: a mis-ordered overlay chain
  // once produced a 34 × 34 film that decoded and concatenated cleanly.
  const meta = spawnSync(ffmpeg, ['-hide_banner', '-i', final], { encoding: 'utf8' }).stderr;
  if (!/Video: h264.*1920x1080/.test(meta)) throw new Error(`Final video is not 1920×1080 H.264:\n${meta}`);
  // Decode the entire final video, detecting corrupt frames or muxing errors.
  run(ffmpeg, ['-v', 'error', '-i', final, '-f', 'null', '-']);
  console.log(`Verified final: ${finalDuration.toFixed(2)}s, 1920×1080, H.264/AAC. ${final}`);
}
