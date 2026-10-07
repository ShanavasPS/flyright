import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
const uri = async file => 'data:image/png;base64,' + (await readFile(file)).toString('base64');
const icons = [];
for (const name of ['journeys', 'updates', 'world', 'people', 'claims']) {
  icons.push(`--icon-${name}:url("${await uri(path.join(root, 'assets/images/tabIcons', name + '@3x.png'))}")`);
}
for (const name of ['stay', 'connection']) {
  icons.push(`--icon-${name}:url("${await uri(path.join(root, 'design/trip-grouping/marker-icons', name + '.png'))}")`);
}
const css = await readFile(path.join(dir, 'canvas.css'), 'utf8');
const script = await readFile(path.join(dir, 'canvas.js'), 'utf8');
const html = (await readFile(path.join(dir, 'canvas.template.html'), 'utf8'))
  .replace('/* STYLES */', () => css)
  .replace('/* SCRIPT */', () => script)
  .replace('<!-- ICONS -->', `<style>:root{${icons.join(';')}}</style>`)
  .replace('BRAND_IMAGE', await uri(path.join(root, 'assets/images/icon.png')));
await writeFile(path.join(dir, 'canvas.html'), html);
console.log('Created self-contained interactive design canvas. No app files changed.');
