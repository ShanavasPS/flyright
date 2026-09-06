#!/usr/bin/env node
/**
 * Regenerates assets/data/airport-timezones.json — the IANA zone every
 * airport in assets/data/airports.json sits in.
 *
 *   npm i && node scripts/build-airport-timezones.mjs
 *
 * Flight times are wall-clock facts of their airport: a Helsinki departure
 * is 08:35 in Helsinki whether the traveler reads it from Vantaa or from
 * Bengaluru. The app stores lookup times as UTC instants, so rendering one
 * needs the zone its airport keeps — that's what this table is for.
 *
 * Derived from the coordinates airports.json already carries (tz-lookup
 * resolves the timezone-boundary-builder shapes), so the two files can't
 * drift: every key here comes from there. That beats the IATA→zone columns
 * in stale open datasets — OpenFlights, last updated 2017, has no row for
 * BER at all.
 *
 * Output is grouped by zone to keep it small (~300 zones for ~4,600
 * airports) and to keep the diff readable when boundaries change:
 *   { "Europe/Helsinki": "HEL,ENF,IVL,..." }
 *
 * Committed, like airports.json, so builds stay offline and reproducible.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import tzLookup from 'tz-lookup';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, '../assets/data/airports.json');
const OUT = join(here, '../assets/data/airport-timezones.json');

const airports = JSON.parse(await readFile(SOURCE, 'utf8'));

/** zone → the codes that sit in it, so the JSON repeats each zone name once. */
const byZone = new Map();
const unresolved = [];

for (const [iata, [lat, lon]] of Object.entries(airports)) {
  let zone;
  try {
    zone = tzLookup(lat, lon);
  } catch {
    // Only thrown for coordinates off the earth; a bad row shouldn't cost
    // the other 4,000 airports their zones.
    unresolved.push(iata);
    continue;
  }
  const codes = byZone.get(zone);
  if (codes) codes.push(iata);
  else byZone.set(zone, [iata]);
}

const out = {};
for (const zone of [...byZone.keys()].sort()) {
  out[zone] = byZone.get(zone).sort().join(',');
}

await writeFile(OUT, `${JSON.stringify(out, null, 0)}\n`);

const codes = Object.keys(airports).length - unresolved.length;
console.log(`${OUT}: ${codes} airports across ${byZone.size} zones`);
if (unresolved.length) {
  console.warn(`no zone for ${unresolved.length}: ${unresolved.join(', ')}`);
}
