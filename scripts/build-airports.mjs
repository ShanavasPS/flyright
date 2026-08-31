#!/usr/bin/env node
/**
 * Regenerates assets/data/airports.json from the OurAirports dataset
 * (public domain, updated daily): large + medium airports with an IATA code.
 *
 *   node scripts/build-airports.mjs
 *
 * Output shape, keyed by IATA code, ~270 KB for ~4,800 airports:
 *   { "HEL": [60.3172, 24.9633, "FI", "Helsinki", 2] } // [lat, lon, country, city, rank?]
 * The trailing rank drives search ordering: 2 = major hub (curated list
 * below — OurAirports marks Laoag City "large" just like LAX, so its type
 * column alone can't rank), 1 = large_airport, omitted = medium.
 *
 * The output is committed so builds stay offline and reproducible.
 */

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../assets/data/airports.json');

/** The world's busiest passenger airports (roughly the global top ~180).
 * Curated because OurAirports has no traffic data — its large_airport type
 * spans everything from LAX to Laoag City. */
const MAJOR_HUBS = new Set(`
  ATL LAX ORD DFW DEN JFK SFO SEA LAS MCO EWR CLT PHX IAH MIA BOS MSP FLL DTW
  PHL LGA BWI SLC SAN IAD DCA MDW TPA PDX HNL STL AUS BNA MSY RDU SJC SMF DAL
  HOU OAK MCI CLE IND PIT CVG CMH SAT ANC
  YYZ YVR YUL YYC YEG YOW
  MEX CUN GDL MTY GRU GIG BSB CGH EZE AEP SCL LIM BOG MDE PTY UIO SJU
  LHR CDG AMS FRA IST MAD BCN LGW MUC FCO MXP LIN DUB ZRH CPH OSL ARN HEL VIE
  BRU GVA LIS OPO ATH PRG BUD WAW KRK OTP SOF BEG ZAG LJU TLL RIX VNO KEF EDI
  GLA MAN BHX STN LTN LCY DUS BER HAM CGN STR NCE LYS MRS TLS BOD NTE SVO DME
  LED
  DXB AUH DOH JED RUH KWI BAH MCT AMM TLV CAI
  JNB CPT NBO ADD LOS ACC CMN ALG TUN
  HND NRT KIX ITM CTS FUK OKA ICN GMP PEK PKX PVG SHA CAN SZX CTU KMG XIY HGH
  NKG WUH CKG TFU HKG TPE MFM BKK DMK KUL SIN CGK DPS SGN HAN MNL CRK DEL BOM
  BLR MAA CCU HYD COK ISB KHI LHE DAC CMB KTM
  SYD MEL BNE PER ADL AKL CHC WLG
`.trim().split(/\s+/));

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
      ...(MAJOR_HUBS.has(iata) ? [2] : type === 'large_airport' ? [1] : []),
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
