import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
await mkdir(path.join(dir, 'previews'), { recursive: true });

// Read the current pure presentation functions. This does not write app code,
// open a database, or change a traveller's flights.
const bundled = await build({
  stdin: { contents: `export { buildTripGroups, tripListSections, tripGroupDates } from './src/services/trip-groups';`, resolveDir: root },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const model = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const airport = { HEL: ['Helsinki', 'FI'], JFK: ['New York', 'US'], LGA: ['New York', 'US'], BOS: ['Boston', 'US'], YYZ: ['Toronto', 'CA'], LHR: ['London', 'GB'] };
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
const multi = [out, caOut, caBack, back];
const scenarios = [
  { id: 'outbound', label: '1 · Outbound flight', rows: [out, directBack], heroId: 'out', now: '2027-06-01T10:00:00Z', day: 'Tue, 1 Jun', time: '13:00', gate: '42', clock: '1:00', proposalSection: 'Current trip',
    summary: 'The first flight is live. The return is already saved.',
    current: 'HEL → JFK is shown only in the live card. The US group now begins with “Stay · 22 days”, without the flight that starts that stay.',
    anchor: 'Keep a small HEL → JFK row before the stay. It points back to the live card; there is still only one countdown.',
    inline: 'The first flight expands under the US heading. This is clear for an outbound flight near the top.' },
  { id: 'connection', label: '2 · First connecting leg', rows: [conA, conB, directBack], heroId: 'connection-a', now: '2027-06-01T05:00:00Z', day: 'Tue, 1 Jun', time: '08:00', gate: '22', clock: '1:00', proposalSection: 'Current trip',
    summary: 'HEL → LHR is live; LHR → JFK follows after a two-hour connection.',
    current: 'The HEL → LHR row is omitted. Its two-hour London connection marker is also omitted, because the previous flight row is no longer present.',
    anchor: 'The compact HEL → LHR row keeps the dotted London connection attached to both flights. The US stay still follows arrival at JFK.',
    inline: 'The live card sits before the connection marker and the next leg. The full journey remains in travel order.' },
  { id: 'onward', label: '3 · Onward connecting leg', rows: [conA, conB, directBack], heroId: 'connection-b', now: '2027-06-01T10:10:00Z', day: 'Tue, 1 Jun', time: '11:10', gate: 'B36', clock: '1:00', proposalSection: 'Current trip',
    summary: 'The first flight has finished its arrival steps. The live card has handed over to LHR → JFK.',
    current: 'HEL → LHR remains, but LHR → JFK and the connection marker disappear from the list. The next visible item is the 22-day US stay.',
    anchor: 'HEL → LHR, the connection, and the compact LHR → JFK row stay together. Only the live card and the small pointer change flight.',
    inline: 'The earlier leg becomes a normal card and the next leg expands in its original place.' },
  { id: 'canada', label: '4 · Canada → US', rows: multi, heroId: 'canada-back', now: '2027-06-14T17:00:00Z', day: 'Mon, 14 Jun', time: '13:00', gate: 'F62', clock: '1:00', proposalSection: 'Current trip',
    summary: 'YYZ → BOS is live. It still belongs to the Canada trip, followed by US trip continued.',
    current: 'The Canada return is at the top, but the card does not name its group. Below, the list jumps from the Canada stay directly to US trip continued.',
    anchor: 'The live card says “Canada trip”. Its compact row stays after the Canada stay. The continued US heading still comes before its nine-day stay.',
    inline: 'The live card expands after the Canada stay. It is easy to place in the trip, but is below the first screen; “Go to live flight” provides a shortcut.' },
  { id: 'homebound', label: '5 · Final flight home', rows: multi, heroId: 'back', now: '2027-06-23T21:00:00Z', day: 'Wed, 23 Jun', time: '17:00', gate: 'E12', clock: '1:00', proposalSection: 'Current trip',
    summary: 'BOS → HEL is live. The last flight belongs to US trip continued.',
    current: 'The only remaining future flight is removed for the live card. The rest of the whole trip is therefore filed under “2027”, even though the traveller is still returning home.',
    anchor: 'The complete itinerary stays under “Current trip”. BOS → HEL keeps its place after the resumed US stay, until its travel-day window finishes.',
    inline: 'The live flight stays at the end, under US trip continued. The shortcut helps reach it, but gate information is no longer visible immediately.' },
  { id: 'stay', label: '6 · Between flights', rows: multi, heroId: null, now: '2027-06-18T16:00:00Z', day: 'Fri, 18 Jun', time: '12:00', proposalSection: 'Current trip', focusGroup: 'continued:back',
    summary: 'The traveller is in Boston. The next flight is five days away, so there is no live flight card.',
    current: 'The stats hero returns and the entire connected trip remains under “Upcoming”, including flights already flown.',
    anchor: 'Show the usual stats card and the full itinerary under “Current trip”. There is no “Live card above” row when no flight is live.',
    inline: 'The same complete itinerary stays visible, with ordinary flight cards. Neither option invents a live card for the stay.' },
  { id: 'oneway', label: '7 · Only one flight saved', rows: [out], heroId: 'out', now: '2027-06-01T10:00:00Z', day: 'Tue, 1 Jun', time: '13:00', gate: '42', clock: '1:00', proposalSection: 'Current trip',
    summary: 'Only HEL → JFK has been added. No return date or stay length is known.',
    current: 'The lone flight is entirely represented by the live card. Its otherwise empty US group is omitted.',
    anchor: 'Show the US heading on the live card itself. With no other itinerary content, skip the redundant pointer row. Adding a return restores the group automatically.',
    inline: 'A US heading with its live flight directly below it is enough. The next departure is unknown, so there is no stay count.' },
  { id: 'finished', label: '8 · After arriving home', rows: multi, heroId: null, now: '2027-06-25T09:00:00Z', day: 'Fri, 25 Jun', time: '12:00', proposalSection: '2027', focusGroup: 'continued:back',
    summary: 'The final arrival steps and travel-day window have finished. The trip is complete.',
    current: 'The stats hero returns. All flights appear again in travel order, under the completed year.',
    anchor: 'The compact row becomes the usual flight card in the same place. The complete trip then moves to its year; no temporary pointer remains.',
    inline: 'The expanded live flight becomes its usual card, in place. The whole trip moves to its completed year.' },
];
for (const s of scenarios) {
  const now = new Date(s.now);
  s.currentSections = model.tripListSections(s.rows, now, s.heroId);
  s.fullSections = model.tripListSections(s.rows, now);
  s.groups = model.buildTripGroups(s.rows).flatMap(t => t.groups.map(g => ({ ...g, dates: model.tripGroupDates(g, 2027) })));
  s.hero = s.rows.find(r => r.id === s.heroId) ?? null;
  s.activeGroup = s.groups.find(g => g.entries.some(e => e.kind === 'flight' && e.journey.id === s.heroId)) ?? s.groups.find(g => g.id === s.focusGroup) ?? s.groups[0];
}
await writeFile(path.join(dir, 'scenarios.json'), JSON.stringify(scenarios, null, 2) + '\n');
const uri = async p => 'data:image/png;base64,' + (await readFile(p)).toString('base64');
const iconRules = [];
for (const name of ['journeys', 'updates', 'people', 'world', 'claims']) iconRules.push(`--icon-${name}:url("${await uri(path.join(root, 'assets/images/tabIcons', name + '@3x.png'))}")`);
for (const name of ['stay', 'connection']) iconRules.push(`--icon-${name}:url("${await uri(path.join(root, 'design/trip-grouping/marker-icons', name + '.png'))}")`);
let html = await readFile(path.join(dir, 'canvas.template.html'), 'utf8');
html = html.replace('<!-- ICON_ASSETS -->', `<style>:root{${iconRules.join(';')}}</style>`)
  .replace('BRAND_ICON', await uri(path.join(root, 'assets/images/icon.png')))
  .replace('/* SCENARIOS */[]', JSON.stringify(scenarios));
await writeFile(path.join(dir, 'canvas.html'), html);
console.log(`Built canvas with ${scenarios.length} scenarios from the current trip-list functions. No app files changed.`);
