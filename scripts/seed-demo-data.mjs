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
 * Pass --future to add a departure three weeks out, which the Pro offer needs
 * before it will propose a take-off reminder (it wants 48h+ of lead time).
 *
 * Pass --travel-day to move the upcoming flight to ~1h out and stamp it
 * through security, which is the state the Travel Day panel is captured in.
 * Without it the upcoming flight sits ~12h out, which is what the Flights,
 * World, stats and verdict panels want. It also marks onboarding done and
 * turns the globe to studio light, so every device matches the listing.
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

/** --future adds a departure far enough out (48h+) for the Pro offer to
 *  propose a take-off reminder instead of a paywall. The demo video needs
 *  that beat; the store panels are shot without it, so it stays opt-in. */
if (flag('future')) {
  TRIPS.splice(1, 0, ['demo-lis', 'Finnair', 'FI', 'AY1755', 'HEL', 'LIS', now + 24 * DAY, 5.0]);
}

/** The aircraft a looked-up flight records (type as the provider names it,
 *  and the registration), so the stats panel's aircraft card has something to
 *  show. Plausible types for each route; the two A350 legs share an airframe
 *  and the A320 legs don't, so both "1 aircraft" and "2 different aircraft"
 *  read appear in the list. */
const AIRCRAFT = {
  'demo-upcoming': ['Airbus A321', 'OH-LZR'],
  'demo-lis': ['Airbus A321', 'OH-LZL'],
  'demo-mad': ['Airbus A320', 'OH-LXK'],
  'demo-arn': ['Airbus A320', 'OH-LXM'],
  'demo-jfk': ['Airbus A350-900', 'OH-LWA'],
  'demo-cdg': ['Embraer 190', 'OH-LKO'],
  'demo-dxb': ['Boeing 777-300ER', 'A6-EQA'],
  'demo-nrt': ['Boeing 787-9 Dreamliner', 'JA861J'],
  'demo-sin': ['Airbus A350-900', 'OH-LWA'],
  'demo-fra': ['Boeing 747-8', 'D-ABYA'],
};

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

/** The upcoming flight carries its boarding pass — the code a scanned pass
 *  leaves on the trip (src/services/boarding-pass), so the trip page's pass
 *  card, the home hero's "Pass" pill and the gate screen all have something
 *  to draw. A well-formed single-leg BCBP for AY1331 HEL→LHR, seat 14A,
 *  sequence 42, on the day the flight is seeded for. */
const PASS = {
  id: 'demo-upcoming',
  seat: '14A',
  bookingReference: 'FRX7YQ',
  format: 'pdf417',
  code() {
    const day = new Date(UPCOMING_AT);
    const start = Date.UTC(day.getFullYear(), 0, 0);
    const doy = Math.round((Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) - start) / DAY);
    return `M1LINDQVIST/MAJA      E${'FRX7YQ'.padEnd(7)}HELLHRAY 1331 ${String(doy).padStart(3, '0')}Y014A0042 100`;
  },
};

/** The airport record each trip keeps (journeys.terminal … actual_arrival,
 *  migration 0014), so the trip card shows a full set of facts rather than
 *  "+ Add" in every box. Offsets are minutes from the scheduled departure /
 *  arrival; the Madrid flight lands 195 minutes late, the verdict's delay. */
const RECORD = {
  'demo-upcoming': { terminal: '2', checkIn: 'Area 2', gate: '22', boardingMin: -40 },
  'demo-mad': { terminal: '2', checkIn: 'Area 1', gate: '31', boardingMin: -40, belt: '7', depMin: 188, arrMin: 195, seat: '21C', booking: 'QW4T7M' },
  'demo-arn': { terminal: '2', checkIn: 'Area 2', gate: '27', boardingMin: -35, belt: '4', depMin: 4, arrMin: -3 },
  'demo-jfk': { terminal: '2', checkIn: 'Area 3', gate: '51', boardingMin: -50, belt: '6', depMin: 9, arrMin: -12 },
  'demo-dxb': { terminal: '3', checkIn: 'Zone C', gate: 'A12', boardingMin: -60, belt: '12', depMin: 11, arrMin: -20 },
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
    pass_code, pass_format, pass_captured_at,
    aircraft_model, aircraft_reg,
    terminal, check_in_desk, gate, boarding_time, baggage_belt, actual_departure, actual_arrival,
    source, created_at, updated_at, deleted_at, synced_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  for (const [id, carrier, carrierCountry, number, from, to, departs, hours] of TRIPS) {
    const j = id === JOURNAL.id ? JOURNAL : id === PASS.id ? PASS : {};
    const pass = id === PASS.id ? PASS : null;
    const r = RECORD[id] ?? {};
    const arrives = departs + hours * HOUR;
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
      j.bookingReference ?? r.booking ?? null,
      j.seat ?? r.seat ?? null,
      pass ? pass.code() : null,
      pass ? pass.format : null,
      pass ? iso(now - 2 * HOUR) : null,
      AIRCRAFT[id]?.[0] ?? null,
      AIRCRAFT[id]?.[1] ?? null,
      r.terminal ?? null,
      r.checkIn ?? null,
      r.gate ?? null,
      r.boardingMin != null ? iso(departs + r.boardingMin * 60_000) : null,
      r.belt ?? null,
      r.depMin != null ? iso(departs + r.depMin * 60_000) : null,
      r.arrMin != null ? iso(arrives + r.arrMin * 60_000) : null,
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

/** The app's key-value settings for a demo device: onboarding done, and the
 *  globe in the studio light the listing panels were shot in (the real-sun
 *  default puts half the World panel in night, depending on the hour). */
function demoSettings(storagePath) {
  const db = new DatabaseSync(storagePath);
  db.exec('CREATE TABLE IF NOT EXISTS storage (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)');
  const put = db.prepare('INSERT OR REPLACE INTO storage (key, value) VALUES (?, ?)');
  put.run('onboarding-seen', iso(now));
  put.run('globe-daylight', 'off');
  db.close();
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

  const settings = join(tmpdir(), `flyright-settings-${Date.now()}.db`);
  const remoteSettings = `/data/data/${PACKAGE}/files/SQLite/ExpoSQLiteStorage`;
  execFileSync('sh', ['-c', `adb exec-out run-as ${PACKAGE} cat ${remoteSettings} > ${settings} || true`]);
  for (const suffix of ['-wal', '-shm']) {
    execFileSync('sh', ['-c', `adb shell run-as ${PACKAGE} rm -f ${remoteSettings}${suffix} || true`]);
  }
  demoSettings(settings);
  execFileSync('sh', ['-c', `adb push ${settings} /data/local/tmp/flyright-settings.db`]);
  execFileSync('sh', [
    '-c',
    `adb shell run-as ${PACKAGE} cp /data/local/tmp/flyright-settings.db files/SQLite/ExpoSQLiteStorage`,
  ]);
  execFileSync('sh', ['-c', `adb shell rm -f /data/local/tmp/flyright-settings.db`]);
  rmSync(settings, { force: true });
  console.log('pushed seeded database and demo settings back to the emulator');
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
  const settings = join(path, '../ExpoSQLiteStorage');
  for (const suffix of ['-wal', '-shm']) rmSync(`${settings}${suffix}`, { force: true });
  demoSettings(settings);
  console.log(`seeded ${path} and its demo settings`);
}
