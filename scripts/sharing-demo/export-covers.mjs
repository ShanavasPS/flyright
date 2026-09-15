import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const out = resolve('demo/out/sharing');
const covers = `${out}/covers`;
await mkdir(covers, { recursive: true });
const scenes = JSON.parse(await readFile(new URL('./edit.json', import.meta.url), 'utf8'));
const layers = [];
const manifest = [];
for (const [index, scene] of scenes.entries()) {
  // Each scene starts on a settled screen: ticket, share sheet, review, journal.
  const name = `flyright-step-${scene.id}-qr.png`;
  const path = `${covers}/${name}`;
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', `${out}/segments/${scene.id}.mp4`, '-ss', '0.2',
    '-frames:v', '1', path,
  ], { stdio: 'inherit' });
  const metadata = await sharp(path).metadata();
  if (metadata.width !== 1080 || metadata.height !== 1350) throw new Error(`Unexpected dimensions: ${name}`);
  layers.push({ input: await sharp(path).resize(540, 675).png().toBuffer(), left: (index % 2) * 540, top: Math.floor(index / 2) * 675 });
  manifest.push({ step: index + 1, title: scene.title.join(' '), file: name, width: metadata.width, height: metadata.height });
  console.log(`Exported ${name}`);
}
await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#050D1C' } })
  .composite(layers).png().toFile(`${out}/flyright-four-steps-preview.png`);
await writeFile(`${covers}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
