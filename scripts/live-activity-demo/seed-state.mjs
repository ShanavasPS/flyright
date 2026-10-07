// Rewrites the seeded demo-upcoming trip (AY1331 HEL→LHR) and its travel_day
// row into one of the five beats of the Live Activity demo — see SCRIPT.md.
// Run scripts/seed-demo-data.mjs --travel-day on the device first; this only
// touches that one journey + travel_day, so the rest of the seed stays.
//
//   node scripts/live-activity-demo/seed-state.mjs --state departs --ios <udid>
//   ANDROID_SERIAL=emulator-5558 node scripts/live-activity-demo/seed-state.mjs --state air --android
//   node scripts/live-activity-demo/seed-state.mjs --state landed --db <path>
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';

const PACKAGE = 'com.shanavasshaji.flyright';
const JOURNEY = 'demo-upcoming';
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const value = (n) => argv[argv.indexOf(`--${n}`) + 1];
const state = value('state');
if (!['departs', 'boarding', 'onboard', 'air', 'landed'].includes(state)) {
  console.error('--state departs|boarding|onboard|air|landed');
  process.exit(1);
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const FLIGHT = 3 * HOUR + 12 * MIN; // AY1331 block time as seeded (3.2h)
const now = Date.now();
const iso = (t) => new Date(t).toISOString();
const round5 = (t) => Math.ceil(t / (5 * MIN)) * (5 * MIN);

/** Departure / arrival clocks, the record's actual times, the stage and its
 *  stamps — the numbers the SCRIPT.md table promises. */
function plan() {
  const walk = (dep) => ({
    at_airport: iso(dep - 2 * HOUR - 34 * MIN),
    checked_in: iso(dep - 2 * HOUR - 22 * MIN),
    bag_dropped: iso(dep - 2 * HOUR - 11 * MIN),
    security: iso(dep - 1 * HOUR - 48 * MIN),
  });
  switch (state) {
    case 'departs': {
      const dep = round5(now + 84 * MIN);
      return { dep, arr: dep + FLIGHT, boarding: dep - 40 * MIN, stage: 'security', stamps: walk(dep) };
    }
    case 'boarding': {
      // Boarding must already be open: the label turns on boarding_time <= now,
      // and rounding the departure up would push a dep-40 boarding past now.
      const dep = round5(now + 39 * MIN);
      return { dep, arr: dep + FLIGHT, boarding: now - 2 * MIN, stage: 'security', stamps: walk(dep) };
    }
    case 'onboard': {
      const dep = round5(now + 18 * MIN);
      return {
        dep,
        arr: dep + FLIGHT,
        boarding: dep - 40 * MIN,
        stage: 'boarded',
        stamps: { ...walk(dep), boarded: iso(now - 2 * MIN) },
      };
    }
    case 'air': {
      const dep = round5(now - 2 * HOUR);
      const actualDep = now - 118 * MIN;
      return {
        dep,
        arr: now + 72 * MIN,
        boarding: dep - 40 * MIN,
        actualDep,
        stage: 'departed',
        stamps: { ...walk(dep), boarded: iso(dep - 22 * MIN), departed: iso(actualDep) },
      };
    }
    case 'landed': {
      const dep = round5(now - 3 * HOUR - 20 * MIN);
      const actualDep = dep + 2 * MIN;
      const actualArr = now - 3 * MIN;
      return {
        dep,
        arr: now - 5 * MIN,
        boarding: dep - 40 * MIN,
        actualDep,
        actualArr,
        stage: 'landed',
        stamps: {
          ...walk(dep),
          boarded: iso(dep - 22 * MIN),
          departed: iso(actualDep),
          landed: iso(actualArr),
        },
      };
    }
  }
}

function patch(dbPath) {
  const p = plan();
  const db = new DatabaseSync(dbPath);
  const row = db.prepare('SELECT id FROM journeys WHERE id = ?').get(JOURNEY);
  if (!row) throw new Error(`${JOURNEY} not seeded — run scripts/seed-demo-data.mjs --travel-day first`);
  db.prepare(
    `UPDATE journeys SET scheduled_departure = ?, scheduled_arrival = ?, boarding_time = ?, baggage_belt = ?,
       actual_departure = ?, actual_arrival = ?, seat = ?, gate = ?, terminal = ?, updated_at = ? WHERE id = ?`,
  ).run(
    iso(p.dep),
    iso(p.arr),
    iso(p.boarding),
    '7',
    p.actualDep ? iso(p.actualDep) : null,
    p.actualArr ? iso(p.actualArr) : null,
    '14A',
    '22',
    '2',
    iso(now),
    JOURNEY,
  );
  db.prepare('DELETE FROM travel_day WHERE journey_id = ?').run(JOURNEY);
  db.prepare(
    `INSERT INTO travel_day (journey_id, stage, stamps, activity_started_at, ended_at, updated_at, synced_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(JOURNEY, p.stage, JSON.stringify(p.stamps), p.stamps.at_airport, null, iso(now), null);
  db.close();
  const clock = (t, tz) => new Date(t).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  console.log(
    `${state}: dep ${clock(p.dep, 'Europe/Helsinki')} HEL, arr ${clock(p.arr, 'Europe/London')} LHR, boarding ${clock(p.boarding, 'Europe/Helsinki')}, stage ${p.stage}` +
      (p.actualArr ? `, landed ${clock(p.actualArr, 'Europe/London')}` : ''),
  );
}

function iosDbPath(udid) {
  const container = execFileSync('xcrun', ['simctl', 'get_app_container', udid, PACKAGE, 'data']).toString().trim();
  return join(container, 'Documents/SQLite/flyright.db');
}

if (flag('ios')) {
  const udid = value('ios');
  const path = iosDbPath(udid);
  for (const suffix of ['-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
  patch(path);
} else if (flag('android')) {
  const local = join(tmpdir(), `flyright-state-${Date.now()}.db`);
  const remote = `/data/data/${PACKAGE}/files/SQLite/flyright.db`;
  const sh = (cmd) => execFileSync('sh', ['-c', cmd], { stdio: ['ignore', 'pipe', 'inherit'] });
  sh(`adb exec-out run-as ${PACKAGE} cat ${remote} > ${local}`);
  for (const suffix of ['-wal', '-shm']) sh(`adb shell run-as ${PACKAGE} rm -f ${remote}${suffix} || true`);
  patch(local);
  sh(`adb push ${local} /data/local/tmp/flyright.db`);
  sh(`adb shell run-as ${PACKAGE} cp /data/local/tmp/flyright.db files/SQLite/flyright.db`);
  sh(`adb shell rm -f /data/local/tmp/flyright.db`);
  rmSync(local, { force: true });
} else if (flag('db')) {
  patch(value('db'));
} else {
  console.error('--ios <udid> | --android | --db <path>');
  process.exit(1);
}
