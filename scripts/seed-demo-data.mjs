#!/usr/bin/env node
/**
 * Seeds the app's local SQLite database with the marketing demo trips used for
 * store screenshots, so the same history can be rebuilt on any simulator or
 * emulator instead of being hand-typed and then lost on the next prebuild.
 *
 *   node scripts/seed-demo-data.mjs --ios [--sim <udid>]
 *   node scripts/seed-demo-data.mjs --android
 *   node scripts/seed-demo-data.mjs --db <path-to-flyright.db>
 *
 * Pass --travel-day to move the upcoming flight to ~1h out and stamp it
 * through security, which is the state the Travel Day panel is captured in.
 * Without it the upcoming flight sits ~12h out, which is what the My travels,
 * World, stats and verdict panels want.
 *
 * Everything is anchored to the moment the script runs, so the relative labels
 * ("in 12h", "3d ago") always read correctly no matter when it is re-seeded.
 * Rows are written with source='manual' so nothing here ever hits the live
 * flight API and burns lookup quota.
 */
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PACKAGE = 'com.shanavasshaji.flyright';
const AIRPORTS = JSON.parse(readFileSync(new URL('../assets/data/airports.json', import.meta.url)));

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
const TRAVEL_DAY = flag('travel-day');

/** Great-circle km between two IATA codes, matching what the app records. */
function distanceKm(a, b) {
  const [lat1, lon1] = AIRPORTS[a];
  const [lat2, lon2] = AIRPORTS[b];
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const country = (code) => AIRPORTS[code][2];
const iso = (d) => new Date(d).toISOString();
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const now = Date.now();

/** The upcoming flight is the one every panel keys off: the My travels banner
 *  counts down to it and the Travel Day panel renders it. Rounded up to the
 *  next five minutes, because a departure board never reads "8:44". */
const FIVE_MIN = 5 * 60_000;
const UPCOMING_AT =
  Math.ceil((now + (TRAVEL_DAY ? 1.15 * HOUR : 12 * HOUR)) / FIVE_MIN) * FIVE_MIN;
const UPCOMING_OFFSET = UPCOMING_AT - now;

/** [id, carrier, carrierCountry, number, from, to, departsAt, durationHours] */
const TRIPS = [
  ['demo-upcoming', 'Finnair', 'FI', 'AY1331', 'HEL', 'LHR', now + UPCOMING_OFFSET, 3.2],
  ['demo-mad', 'Finnair', 'FI', 'AY954', 'HEL', 'MAD', now - 45 * DAY, 4.7],
  // A genuine short hop, so the stats panel's "shortest flight" record is not
  // a 1,800km leg — every history has one of these in it.
  ['demo-arn', 'Finnair', 'FI', 'AY811', 'HEL', 'ARN', now - 74 * DAY, 1.1],
  ['demo-jfk', 'Finnair', 'FI', 'AY5', 'HEL', 'JFK', now - 118 * DAY, 9.1],
  ['demo-cdg', 'Finnair', 'FI', 'AY1551', 'HEL', 'CDG', now - 160 * DAY, 3.5],
  ['demo-dxb', 'Emirates', 'AE', 'EK215', 'DXB', 'LAX', now - 210 * DAY, 16.3],
  ['demo-nrt', 'Japan Airlines', 'JP', 'JL61', 'LAX', 'NRT', now - 232 * DAY, 11.7],
  ['demo-sin', 'Finnair', 'FI', 'AY131', 'HEL', 'SIN', now - 288 * DAY, 11.6],
  ['demo-fra', 'Lufthansa', 'DE', 'LH400', 'FRA', 'JFK', now - 340 * DAY, 8.6],
];

/** A 3h15m arrival delay on a 1500-3500km EU flight is exactly the 400 EUR
 *  band — the badge that makes the compensation panel worth a screenshot. */
const DELAYED_TRIP = 'demo-mad';
const DELAY_MINUTES = 195;

/** One trip carries a journal entry so the notes, rating and seat surfaces
 *  are populated wherever a panel shows them. */
const JOURNAL = {
  id: 'demo-dxb',
  notes:
    'Left Dubai just after sunrise and chased the light all the way across the Pacific. ' +
    'Seat 34A had the whole wing to itself.',
  rating: 5,
  seat: '34A',
  bookingReference: 'K8ZP2Q',
};

function seed(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = OFF');

  // Clear only what this script owns, so a real signed-in account's rows on
  // the device are never silently destroyed by a screenshot run.
  for (const table of ['trip_photos', 'travel_day', 'disruptions', 'claims', 'evidence']) {
    try {
      db.exec(`DELETE FROM ${table}`);
    } catch {
      /* table may not exist on older schemas */
    }
  }
  db.exec('DELETE FROM journeys');

  const insert = db.prepare(`INSERT INTO journeys (
    id, user_id, mode, carrier, carrier_country, number,
    from_code, from_country, to_code, to_country, distance_km,
    scheduled_departure, scheduled_arrival, ticket_price_amount, ticket_price_currency,
    notes, notes_updated_at, rating, booking_reference, seat,
    source, created_at, updated_at, deleted_at, synced_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  for (const [id, carrier, carrierCountry, number, from, to, departs, hours] of TRIPS) {
    const j = id === JOURNAL.id ? JOURNAL : {};
    insert.run(
      id,
      null,
      'flight',
      carrier,
      carrierCountry,
      number,
      from,
      country(from),
      to,
      country(to),
      distanceKm(from, to),
      iso(departs),
      iso(departs + hours * HOUR),
      null,
      null,
      j.notes ?? null,
      j.notes ? iso(departs + DAY) : null,
      j.rating ?? null,
      j.bookingReference ?? null,
      j.seat ?? null,
      'manual',
      iso(departs),
      iso(departs),
      null,
      null,
    );
  }

  const trip = TRIPS.find(([id]) => id === DELAYED_TRIP);
  db.prepare(
    `INSERT INTO disruptions (id, journey_id, type, delay_minutes, notice_days, extraordinary, detected_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(
    'demo-disruption-mad',
    DELAYED_TRIP,
    'delay',
    DELAY_MINUTES,
    null,
    0,
    iso(trip[6] + trip[7] * HOUR),
  );

  if (TRAVEL_DAY) {
    // Stamped through security: enough of the stepper is filled in to show
    // what it does, with the remaining steps still ahead of the traveler.
    const stamps = {
      at_airport: iso(now - 70 * 60_000),
      checked_in: iso(now - 58 * 60_000),
      bag_dropped: iso(now - 47 * 60_000),
      security: iso(now - 24 * 60_000),
    };
    db.prepare(
      `INSERT INTO travel_day (journey_id, stage, stamps, activity_started_at, ended_at, updated_at, synced_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).run('demo-upcoming', 'security', JSON.stringify(stamps), iso(now - 70 * 60_000), null, iso(now), null);
  }

  const total = db.prepare('SELECT count(*) n, round(sum(distance_km)) km FROM journeys').get();
  const countries = db
    .prepare('SELECT count(DISTINCT c) n FROM (SELECT from_country c FROM journeys UNION SELECT to_country FROM journeys)')
    .get();
  db.close();
  console.log(
    `seeded ${total.n} trips · ${Number(total.km).toLocaleString('en-US')} km · ${countries.n} countries` +
      (TRAVEL_DAY ? ' · travel-day stamped through security' : ''),
  );
}

/** The simulator keeps the database inside the app's data container. */
function iosDbPath(udid) {
  const container = execFileSync('xcrun', ['simctl', 'get_app_container', udid, PACKAGE, 'data'])
    .toString()
    .trim();
  return join(container, 'Documents/SQLite/flyright.db');
}

/** The emulator has no sqlite3 binary, so the file is pulled out through
 *  run-as, seeded on the host, and pushed back the same way. */
function android() {
  const local = join(tmpdir(), `flyright-seed-${Date.now()}.db`);
  const remote = `/data/data/${PACKAGE}/files/SQLite/flyright.db`;
  execFileSync('sh', ['-c', `adb exec-out run-as ${PACKAGE} cat ${remote} > ${local}`]);
  // WAL contents live beside the file; drop them so the seed is what is read.
  for (const suffix of ['-wal', '-shm']) {
    execFileSync('sh', ['-c', `adb shell run-as ${PACKAGE} rm -f ${remote}${suffix} || true`]);
  }
  seed(local);
  execFileSync('sh', ['-c', `adb push ${local} /data/local/tmp/flyright.db`]);
  // `cp` under run-as, not a `sh -c 'cat > file'` redirect: the redirect is
  // opened before run-as drops to the app uid, so it lands as Permission
  // denied on the app's own private directory.
  execFileSync('sh', [
    '-c',
    `adb shell run-as ${PACKAGE} cp /data/local/tmp/flyright.db files/SQLite/flyright.db`,
  ]);
  execFileSync('sh', ['-c', `adb shell rm -f /data/local/tmp/flyright.db`]);
  rmSync(local, { force: true });
  console.log('pushed seeded database back to the emulator');
}

if (flag('android')) {
  android();
} else if (flag('db')) {
  seed(value('db'));
} else {
  const udid =
    value('sim') ??
    execFileSync('sh', [
      '-c',
      `xcrun simctl list devices booted | grep -oE '[0-9A-F-]{36}' | head -1`,
    ])
      .toString()
      .trim();
  const path = iosDbPath(udid);
  // Same WAL caution as Android: stale journal files would mask the seed.
  for (const suffix of ['-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
  copyFileSync(path, `${path}.bak`);
  seed(path);
  console.log(`seeded ${path}`);
}
