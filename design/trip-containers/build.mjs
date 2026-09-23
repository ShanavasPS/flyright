import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
await mkdir(path.join(dir, 'previews'), { recursive: true });
// Read-only presentation functions with fictional flights. No app or data writes.
const bundled = await build({
  stdin: { contents: `export { buildTripGroups, tripListSections, tripGroupDates, tripHeroGroup } from './src/services/trip-groups';`, resolveDir: root },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const model = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const airport = { HEL: ['Helsinki', 'FI'], JFK: ['New York', 'US'], LGA: ['New York', 'US'], BOS: ['Boston', 'US'], YYZ: ['Toronto', 'CA'], LHR: ['London', 'GB'], LIS: ['Lisbon', 'PT'] };
const flight = (id, number, fromCode, toCode, scheduledDeparture, scheduledArrival, duration) => ({
  id, number, fromCode, toCode, scheduledDeparture, scheduledArrival, duration, mode: 'flight',
  fromCity: airport[fromCode][0], toCity: airport[toCode][0], fromCountry: airport[fromCode][1], toCountry: airport[toCode][1],
  bookingReference: null, deletedAt: null,
});
const out = flight('out', 'AY5', 'HEL', 'JFK', '2027-06-01T14:00', '2027-06-01T15:55', '8h 55m');
const back = flight('back', 'AY8', 'BOS', 'HEL', '2027-06-23T18:00', '2027-06-24T08:00', '7h');
const directBack = flight('direct-back', 'AY6', 'JFK', 'HEL', '2027-06-23T18:00', '2027-06-24T09:00', '8h');
const caOut = flight('canada-out', 'AC701', 'LGA', 'YYZ', '2027-06-10T10:00', '2027-06-10T11:40', '1h 40m');
const caBack = flight('canada-back', 'AC770', 'YYZ', 'BOS', '2027-06-14T14:00', '2027-06-14T15:40', '1h 40m');
const conA = flight('connection-a', 'AY1331', 'HEL', 'LHR', '2027-06-01T09:00', '2027-06-01T10:10', '3h 10m');
const conB = flight('connection-b', 'BA175', 'LHR', 'JFK', '2027-06-01T12:10', '2027-06-01T15:00', '7h 50m');
const portugal = flight('portugal', 'AY1739', 'HEL', 'LIS', '2027-07-09T12:00', '2027-07-09T14:50', '4h 50m');
const portugalBack = flight('portugal-back', 'AY1740', 'LIS', 'HEL', '2027-07-16T15:30', '2027-07-16T22:10', '4h 40m');
const multi = [out, caOut, caBack, back];
const scenarios = [
  { id: 'canada', label: 'USA → Canada → USA', rows: multi, now: '2027-05-01T09:00:00Z', summary: 'Three separate groups. YYZ → BOS stays in Canada; the continued US stay comes after its own header.' },
  { id: 'return', label: 'Simple return', rows: [out, directBack], now: '2027-05-01T09:00:00Z', summary: 'A single US container includes the outbound flight, the 22-day stay and the return home.' },
  { id: 'connections', label: 'Return with a connection', rows: [conA, conB, directBack], now: '2027-05-01T09:00:00Z', summary: 'The dotted London connection stays between its flights. The US stay starts only after arrival in New York.' },
  { id: 'independent', label: 'Two independent trips', rows: [out, directBack, portugal, portugalBack], now: '2027-05-01T09:00:00Z', summary: 'US and Portugal have their own filled containers. The old full-width separator is removed.' },
  { id: 'first-live', label: 'First flight is live', rows: [out, directBack], heroId: 'out', now: '2027-06-01T10:00:00Z', time: '13:00', gate: '42', clock: '1:00', summary: 'Small travel summary first, then the US group with its expanded live flight. One flight card and no jump links.' },
  { id: 'later-live', label: 'Later flight is live', rows: multi, heroId: 'canada-back', now: '2027-06-14T17:00:00Z', time: '13:00', gate: 'F62', clock: '1:00', summary: 'The live card stays at the top. The full YYZ → BOS row remains inside Canada, with working links in both directions.' },
  { id: 'oneway', label: 'Only one flight saved', rows: [out], now: '2027-05-01T09:00:00Z', summary: 'The flag, title, date and single flight share one container. No return or stay length is invented.' },
  { id: 'finished', label: 'Completed trip', rows: multi, now: '2027-06-25T09:00:00Z', summary: 'The same three groups are kept together under 2027, with every flight in travel order.' },
];
for (const s of scenarios) {
  s.heroId ??= null;
  s.time ??= '9:41';
  s.sections = model.tripListSections(s.rows, new Date(s.now), s.heroId);
  s.hero = s.rows.find(r => r.id === s.heroId) ?? null;
  s.heroGroup = model.tripHeroGroup(s.rows, new Date(s.now), s.heroId) ?? null;
}
await writeFile(path.join(dir, 'scenarios.json'), JSON.stringify(scenarios, null, 2) + '\n');
const uri = async p => 'data:image/png;base64,' + (await readFile(p)).toString('base64');
const iconRules = [];
for (const name of ['journeys', 'updates', 'people', 'world', 'claims']) iconRules.push(`--icon-${name}:url("${await uri(path.join(root, 'assets/images/tabIcons', name + '@3x.png'))}")`);
for (const name of ['stay', 'connection']) iconRules.push(`--icon-${name}:url("${await uri(path.join(root, 'design/trip-grouping/marker-icons', name + '.png'))}")`);
let html = await readFile(path.join(dir, 'canvas.template.html'), 'utf8');
html = html.replace('/* BASE_CSS */', await readFile(path.join(dir, 'base.css'), 'utf8'))
  .replace('/* PRIMITIVES */', await readFile(path.join(dir, 'primitives.js'), 'utf8'))
  .replace('<!-- ICON_ASSETS -->', `<style>:root{${iconRules.join(';')}}</style>`)
  .replace('BRAND_ICON', await uri(path.join(root, 'assets/images/icon.png')))
  .replace('/* SCENARIOS */[]', JSON.stringify(scenarios));
await writeFile(path.join(dir, 'canvas.html'), html);
console.log(`Built design-only canvas: three surfaces, ${scenarios.length} scenarios. App files unchanged.`);
