import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { concepts, iconSvg, colors } from './concepts.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
await mkdir(path.join(dir, 'assets'), { recursive: true });

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const text = (value, x, y, size = 16, weight = 500, fill = colors.ink) => `<text x="${x}" y="${y}" font-family="Helvetica Neue,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escape(value)}</text>`;
function lines(value, max = 52) {
  const result = [''];
  for (const word of value.split(' ')) {
    const last = result.length - 1;
    if (`${result[last]} ${word}`.trim().length > max) result.push(word);
    else result[last] = `${result[last]} ${word}`.trim();
  }
  return result;
}
function placedIcon(id, x, y, size, mode = 'dark', mask = 'rounded', uid = '') {
  return `<g transform="translate(${x} ${y})">${iconSvg(id, { size, mode, mask, uid, label: false })}</g>`;
}
function conceptCard(c, index) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="860" viewBox="0 0 640 860">
    <rect width="640" height="860" fill="#fff"/>
    <rect x="0.5" y="0.5" width="639" height="859" rx="24" fill="#fff" stroke="#e3e8ef"/>
    <path d="M24 0H616Q640 0 640 24V400H0V24Q0 0 24 0Z" fill="${colors.porcelain}"/>
    ${text(`${c.id.toUpperCase()} / 0${index + 1}`, 32, 40, 13, 500, '#5a6a7e')}
    ${placedIcon(c.id, 170, 60, 300, 'dark', 'rounded', 'hero')}
    ${text(c.category, 32, 440, 15, 500, '#5a6a7e')}
    ${text(c.name, 32, 488, 36, 700)}
    ${lines(c.summary).map((line, i) => text(line, 32, 524 + i * 24, 18, 500, '#5a6a7e')).join('')}
    <path d="M32 584H608" stroke="#e3e8ef"/>
    ${['light', 'dark', 'mono'].map((mode, i) => placedIcon(c.id, 32 + i * 140, 608, 68, mode, 'rounded', `variant${i}`) + text(['Porcelain', 'Navy', 'One colour'][i], 32 + i * 140, 702, 13, 500, '#5a6a7e')).join('')}
    ${placedIcon(c.id, 492, 608, 68, 'dark', 'circle', 'circle')}${text('Circle mask', 480, 702, 13, 500, '#5a6a7e')}
    <path d="M32 728H608" stroke="#e3e8ef"/>
    ${text('Small-size check', 32, 762, 13, 600, '#5a6a7e')}
    ${[40, 24, 16].map((size, i) => placedIcon(c.id, 240 + i * 112, 784 - size, size, 'dark', 'rounded', `small${i}`) + text(`${size} px`, 236 + i * 112, 812, 12, 500, '#5a6a7e')).join('')}
    ${text('FlyRight / Identity study 01', 32, 835, 11, 500, '#5a6a7e')}
  </svg>`;
}

for (const [index, concept] of concepts.entries()) {
  for (const mode of ['light', 'dark', 'mono']) {
    const source = iconSvg(concept.id, { mode, mask: 'square', size: 1024, uid: 'file' });
    const filename = path.join(dir, 'assets', `${concept.id}-${concept.name.toLowerCase()}-${mode}`);
    await writeFile(`${filename}.svg`, source);
    await sharp(Buffer.from(source)).png().toFile(`${filename}.png`);
  }
  const card = conceptCard(concept, index);
  await writeFile(path.join(dir, 'assets', `${concept.id}-board.svg`), card);
  await sharp(Buffer.from(card)).png().toFile(path.join(dir, 'assets', `${concept.id}-board.png`));
}

const current = await sharp(path.join(root, 'assets/images/icon.png')).resize(120).png().toBuffer();
const template = await readFile(path.join(dir, 'canvas.template.html'), 'utf8');
const source = (await readFile(path.join(dir, 'concepts.mjs'), 'utf8')).replaceAll('export ', '');
await writeFile(path.join(dir, 'canvas.html'), template.replace('__CONCEPT_SOURCE__', () => source).replace('__CURRENT_ICON__', `data:image/png;base64,${current.toString('base64')}`));

const overview = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1040" viewBox="0 0 1600 1040">
  <rect width="1600" height="1040" fill="#ffffff"/>
  ${text('FlyRight', 48, 48, 24, 700)}${text('Identity study / 01 · 21 September 2026', 1170, 44, 12, 500, '#5a6a7e')}
  <path d="M48 76H1552" stroke="#e3e8ef"/>
  ${text('A clearer mark. A more confident FlyRight.', 48, 140, 34, 700)}
  ${text('Four app-icon directions. Existing brand colours. One strong silhouette each.', 48, 178, 17, 500, '#5a6a7e')}
  ${concepts.map((c, i) => `<g transform="translate(${48 + i * 382} 220) scale(.55)">${conceptCard(c, i)}</g>`).join('')}
  <path d="M48 732H1552" stroke="#e3e8ef"/>
  ${text('Recommended: A / Contrail', 48, 772, 20, 700)}
  ${text('The original departure-and-reassurance idea, reduced to one continuous, recognisable mark.', 48, 806, 17, 500, '#5a6a7e')}
  ${text('A / Contrail', 48, 867, 15, 700)}${text('Evolves the existing identity.', 48, 895, 14, 500, '#5a6a7e')}
  ${text('B / Wingform', 430, 867, 15, 700)}${text('A distinct F monogram.', 430, 895, 14, 500, '#5a6a7e')}
  ${text('C / Orbit', 812, 867, 15, 700)}${text('An open route around the world.', 812, 895, 14, 500, '#5a6a7e')}
  ${text('D / Departure', 1194, 867, 15, 700)}${text('The most literal aviation option.', 1194, 895, 14, 500, '#5a6a7e')}
  <path d="M48 952H1552" stroke="#e3e8ef"/>
  ${text('Concept review only · No installed assets changed · B–D explore alternatives to the current contrail-check rule', 48, 986, 12, 500, '#5a6a7e')}
  ${text('Open canvas.html to compare masks, colours and actual small sizes.', 48, 1008, 12, 500, '#5a6a7e')}
</svg>`;
await writeFile(path.join(dir, 'overview.svg'), overview);
await sharp(Buffer.from(overview)).png().toFile(path.join(dir, 'overview.png'));
console.log('Rendered 4 concepts × 3 appearances, 4 canvas boards, overview, and self-contained canvas.html.');
