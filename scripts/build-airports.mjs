#!/usr/bin/env node
/**
 * Regenerates assets/data/airports.json from the OurAirports dataset
 * (public domain, updated daily): large + medium airports with an IATA code.
 *
 *   node scripts/build-airports.mjs
 *
 * Output shape, keyed by IATA code, ~270 KB for ~4,800 airports:
 *   { "HEL": [60.3172, 24.9633, "FI", "Helsinki"] }   // [lat, lon, country, city]
 *
 * The output is committed so builds stay offline and reproducible.
 */

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../assets/data/airports.json');

/** Minimal CSV row parser that honours quoted fields with embedded commas. */
function parseRow(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`GET ${SOURCE} → ${res.status}`);
const csv = await res.text();

const [headerLine, ...lines] = csv.split('\n');
const header = parseRow(headerLine);
const col = Object.fromEntries(header.map((name, i) => [name, i]));

const airports = {};
let kept = 0;
for (const line of lines) {
  if (!line.trim()) continue;
  const row = parseRow(line);
  const type = row[col.type];
  if (type !== 'large_airport' && type !== 'medium_airport') continue;
  const iata = row[col.iata_code]?.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iata)) continue;
  const lat = Number(row[col.latitude_deg]);
  const lon = Number(row[col.longitude_deg]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

  // On duplicate IATA codes, prefer the large airport.
  if (airports[iata] && airports[iata].type === 'large_airport') continue;

  airports[iata] = {
    type,
    entry: [
      Math.round(lat * 10000) / 10000,
      Math.round(lon * 10000) / 10000,
      row[col.iso_country] ?? '',
      row[col.municipality]?.trim() || row[col.name] || '',
    ],
  };
  kept++;
}

const out = Object.fromEntries(
  Object.keys(airports)
    .sort()
    .map((iata) => [iata, airports[iata].entry]),
);

const json = JSON.stringify(out);
await writeFile(OUT, json);
console.log(`Wrote ${Object.keys(out).length} airports (${kept} rows kept) → ${OUT}`);
console.log(`${(json.length / 1024).toFixed(0)} KB`);
