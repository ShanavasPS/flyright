#!/usr/bin/env node
/**
 * Generate the film of Maja's day, one clip per scene, through ElevenLabs'
 * media generation API (POST /v1/flows/video, which needs a Pro plan or
 * above on the API). Prompts come from storyboard-movie.json; every shot
 * carries the same style line and character description, plus a reference
 * image of Maja so she is the same woman throughout.
 *
 *   ELEVENLABS_API_KEY=… DEMO_OUT=<output dir> node scripts/shipaton-demo/movie.mjs [--probe] [--scene <id>,<id>]
 *
 * --probe generates the first scene only and reports the credits it cost.
 * Finished clips land in <DEMO_OUT>/movie/<scene id>.mp4 and are skipped on
 * re-runs; the character sheet is <DEMO_OUT>/movie/maja-reference.png.
 * Clips made elsewhere (the ElevenLabs Studio, another provider) can be
 * dropped into that folder under the same names and the renderer uses them.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.DEMO_OUT || join(HERE, 'output', 'story-v5');
const API = 'https://api.elevenlabs.io/v1';
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error('Set ELEVENLABS_API_KEY.');
const VIDEO_MODEL = process.env.DEMO_VIDEO_MODEL || 'bytedance-seedance-v2.5';
const IMAGE_MODEL = process.env.DEMO_IMAGE_MODEL || 'gemini-3.1-flash-image';
const RESOLUTION = process.env.DEMO_VIDEO_RESOLUTION || '720p';
const args = process.argv.slice(2);
const probe = args.includes('--probe');
const only = args.includes('--scene') ? args[args.indexOf('--scene') + 1].split(',') : null;
// --takes N makes N candidates of each selected scene under movie/takes/
// (<id>-A.mp4, <id>-B.mp4 …) and leaves the scene's current clip alone.
const takes = args.includes('--takes') ? Number(args[args.indexOf('--takes') + 1]) : 0;
// --label X names the first take X (then Y, Z …) so new takes sit beside old ones.
const label0 = args.includes('--label') ? args[args.indexOf('--label') + 1].charCodeAt(0) : 65;
// --start <image> continues from that frame (Veo's start_frame): the framing,
// the character and the set come from the image, so no reference images are
// sent. --prompt <text> replaces the storyboard's shot for this run.
const startImage = args.includes('--start') ? args[args.indexOf('--start') + 1] : null;
const promptOverride = args.includes('--prompt') ? args[args.indexOf('--prompt') + 1] : null;
// --end <image> pins the last frame too (Veo's end_frame), so the model only
// animates the transition between the two stills.
const endImage = args.includes('--end') ? args[args.indexOf('--end') + 1] : null;

const board = JSON.parse(await readFile(join(HERE, 'storyboard-story.json'), 'utf8'));
const movie = JSON.parse(await readFile(join(HERE, 'storyboard-movie.json'), 'utf8'));
await mkdir(join(OUT, 'movie'), { recursive: true });

const headers = { 'xi-api-key': KEY, 'content-type': 'application/json' };
// Under the VPN the first connection sometimes times out (its DNS returns a
// bogus IPv6 entry beside the real address); retry network failures a few
// times before giving up. HTTP errors are not retried.
const rawFetch = globalThis.fetch;
async function fetch(url, init) {
  for (let attempt = 1; ; attempt++) {
    try { return await rawFetch(url, init); } catch (e) {
      if (attempt >= 4) throw e;
      console.log(`  network error (${e.cause?.code || e.message}), retrying in ${attempt * 5}s…`);
      await new Promise((r) => setTimeout(r, attempt * 5000));
    }
  }
}
async function credits() {
  const res = await fetch(`${API}/user/subscription`, { headers: { 'xi-api-key': KEY } });
  const s = await res.json();
  return s.character_count;
}
async function create(kind, body) {
  const res = await fetch(`${API}/flows/${kind}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${kind} generation: ${res.status} ${(await res.text()).replace(/"content_base64":"[^"]+"/g, '"content_base64":"…"').slice(0, 600)}`);
  return (await res.json()).id;
}
async function wait(kind, id, label) {
  for (let i = 0; i < 240; i++) {
    const res = await fetch(`${API}/flows/${kind}/${id}`, { headers: { 'xi-api-key': KEY } });
    if (!res.ok) throw new Error(`${kind} ${id}: ${res.status} ${await res.text()}`);
    const g = await res.json();
    if (g.status === 'completed') return g;
    if (g.status === 'failed') throw new Error(`${label}: ${g.failure_reason} — ${g.error_message}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`${label}: still not finished after 20 minutes`);
}
async function download(url, path) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}
const b64 = async (path) => (await readFile(path)).toString('base64');

// 1. Maja's character sheet, from the avatar the store profile already uses.
const refPath = join(OUT, 'movie', 'maja-reference.png');
// DEMO_REFERENCE_PHOTO=1 uses the storyboard's characterPhoto crop directly as the
// reference instead of generating a sheet (the sheet drifted from the real face).
if (!existsSync(refPath) && process.env.DEMO_REFERENCE_PHOTO === '1' && movie.characterPhoto) {
  await (await import('node:fs/promises')).copyFile(join(HERE, movie.characterPhoto.replace(/\.jpg$/, '-crop.png')), refPath);
}
if (!existsSync(refPath)) {
  const before = await credits();
  const id = await create('image', {
    model_id: IMAGE_MODEL,
    prompt: `Full-body reference photo of the same woman as in the reference image — keep her face, skin tone, hair and build exactly — standing, three-quarter view, plain light-grey studio background, soft daylight. ${movie.character} Photorealistic, no text.`,
    images: [{ type: 'inline_base64', content_base64: await b64(join(HERE, movie.characterPhoto ?? 'brand/maja-avatar.png')), mime_type: (movie.characterPhoto ?? '').endsWith('.jpg') ? 'image/jpeg' : 'image/png' }],
    aspect_ratio: '3:4',
  });
  const g = await wait('image', id, 'character sheet');
  await download(g.content_url, refPath);
  console.log(`Character sheet ready (${(await credits()) - before} credits).`);
}

// 2. One clip per scene.
const scenes = board.scenes.filter((s) => movie.shots[s.id] && (!only || only.includes(s.id)));
const list = probe ? scenes.slice(0, 1) : scenes;
const pending = [];
if (takes) await mkdir(join(OUT, 'movie', 'takes'), { recursive: true });
const jobs = list.flatMap((scene) => takes ? Array.from({ length: takes }, (_, k) => ({ scene, take: String.fromCharCode(label0 + k) })) : [{ scene }]);
for (const { scene, take } of jobs) {
  const path = take ? join(OUT, 'movie', 'takes', `${scene.id}-${take}.mp4`) : join(OUT, 'movie', `${scene.id}.mp4`);
  if (existsSync(path)) { console.log(`${scene.id}${take ? ' ' + take : ''}: kept`); continue; }
  const veo = VIDEO_MODEL.startsWith('veo');
  const seconds = veo ? [4, 6, 8].reduce((best, d) => (Math.abs(d - scene.duration) < Math.abs(best - scene.duration) ? d : best), 8) : Math.max(4, Math.min(10, scene.duration));
  // Scenes listed in `noCharacter` (the exterior of the plane, her people
  // at home) go without Maja's reference image and description: with them,
  // the model puts her into every shot.
  const withMaja = !(movie.noCharacter ?? []).includes(scene.id);
  // Reference images: Maja's sheet (unless the scene is without her), then
  // any location photos the storyboard lists for the scene (`references`),
  // which Veo takes as scene elements. Veo allows three in total.
  const refs = [];
  if (withMaja) refs.push({ path: refPath, mime: 'image/png' });
  for (const r of movie.references?.[scene.id] ?? []) refs.push({ path: join(HERE, r), mime: r.endsWith('.png') ? 'image/png' : 'image/jpeg' });
  const images = [];
  for (const r of startImage ? [] : refs.slice(0, veo ? 3 : 9)) {
    const ref = { type: 'inline_base64', content_base64: await b64(r.path), mime_type: r.mime };
    images.push(veo ? { image: ref, role: 'subject' } : ref);
  }
  const body = {
    model_id: VIDEO_MODEL,
    prompt: `${movie.style} ${withMaja ? movie.character : movie.friends} Shot: ${promptOverride ?? movie.shots[scene.id]}`,
    ...(startImage ? { start_frame: { type: 'inline_base64', content_base64: await b64(startImage), mime_type: startImage.endsWith('.png') ? 'image/png' : 'image/jpeg' } } : {}),
    ...(endImage ? { end_frame: { type: 'inline_base64', content_base64: await b64(endImage), mime_type: endImage.endsWith('.png') ? 'image/png' : 'image/jpeg' } } : {}),
    ...(movie.negative && veo ? { negative_prompt: movie.negative } : {}),
    aspect_ratio: '16:9',
    resolution: RESOLUTION,
    duration_secs: veo ? (startImage && endImage && process.env.DEMO_CLIP_SECONDS ? Number(process.env.DEMO_CLIP_SECONDS) : 8) : seconds,
    generate_audio: false,
    ...(images.length ? { images } : {}),
  };
  const before = await credits();
  const id = await create('video', body);
  console.log(`${scene.id}${take ? ' ' + take : ''}: submitted (${VIDEO_MODEL}, ${body.duration_secs}s, ${startImage ? (endImage ? 'from start and end frames' : 'from a start frame') : images.length + ' reference images'})`);
  pending.push({ scene, id, path, before, take });
}
const spent = [];
for (const p of pending) {
  const g = await wait('video', p.id, p.scene.id);
  await download(g.content_url, p.path);
  const cost = (await credits()) - p.before;
  spent.push(cost);
  console.log(`${p.scene.id}${p.take ? ' ' + p.take : ''}: ready → ${p.path}`);
}
if (spent.length) console.log(`Total credits this run: ${spent.reduce((a, b) => a + b, 0)}${probe ? ` — a full run of ${scenes.length} scenes would be roughly ${spent[0] * scenes.length}` : ''}.`);
