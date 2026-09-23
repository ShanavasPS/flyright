import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
const data = async file => `data:image/png;base64,${(await readFile(path.join(root, file))).toString('base64')}`;
const icons = await Promise.all(['journeys', 'updates', 'world', 'people', 'claims'].map(name => data(`assets/images/tabIcons/${name}@2x.png`)));
const template = await readFile(path.join(dir, 'canvas.template.html'), 'utf8');
const assembled = template.replace('__REVISED_PANELS__', await readFile(path.join(dir, 'revised-panels.html'), 'utf8')).replace('__TIMING_BEHAVIOR__',await readFile(path.join(dir,'timing-behavior.js'),'utf8')).replace('__REVISED_BEHAVIOR__', await readFile(path.join(dir, 'revised-behavior.js'), 'utf8'));
const html = assembled.replace('__BRAND__', await data('assets/images/icon.png')).replace('__ASSETS__', JSON.stringify(icons));
await writeFile(path.join(dir, 'canvas.html'), html);
const flowTemplate = await readFile(path.join(dir, 'flow.template.html'), 'utf8');
const styles = template.match(/<style>([\s\S]*?)<\/style>/)[1];
await writeFile(path.join(dir, 'flow.html'), flowTemplate.replace('__STYLES__', styles).replace('__BRAND__', await data('assets/images/icon.png')).replace('__ASSETS__', JSON.stringify(icons)));
console.log('Built canvas.html and flow.html (offline design previews only).');
