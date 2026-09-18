// Reshoot the two landing captures that show the flight in the air — the
// trip page (travel-day.png) and the World tab (world.png) — in light and
// dark, from the Release build on the FlyRight Shots simulator.
//
//   node scripts/capture-landing-shots.mjs <udid>
//
// Seeds the demo trips (--travel-day), then moves the upcoming HEL→LHR into
// the air (departed 1 h ago, lands in 2 h 12 m) so dead reckoning, the
// beacon and the progress contrail all show; sets the 9:41 status bar;
// captures each deep link per appearance; downsizes to the 640 px palette
// PNGs the page ships. Restores the light appearance at the end.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('sharp');

const [udid] = process.argv.slice(2);
if (!udid) throw new Error('usage: node scripts/capture-landing-shots.mjs <udid>');
const APP = 'com.shanavasshaji.flyright';
const REPO = new URL('..', import.meta.url).pathname;
const OUT = join(REPO, 'assets/images/landing');
const sim = (...args) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// terminate fails when the app is not running; that is fine.
const stop = () => { try { sim('terminate', udid, APP); } catch {} };
const work = mkdtempSync(join(tmpdir(), 'landing-'));

// 1. Seed, then put the demo flight in the air.
stop();
execFileSync('node', [join(REPO, 'scripts/seed-demo-data.mjs'), '--ios', '--sim', udid, '--travel-day'], { stdio: 'inherit' });
const container = sim('get_app_container', udid, APP, 'data');
const db = new DatabaseSync(join(container, 'Documents/SQLite/flyright.db'));
const now = Date.now();
db.prepare('update journeys set scheduled_departure=?, scheduled_arrival=? where id=?').run(
  new Date(now - 60 * 60_000).toISOString(),
  new Date(now + 132 * 60_000).toISOString(),
  'demo-upcoming',
);
console.log(db.prepare('select id, scheduled_departure, scheduled_arrival from journeys where id=?').get('demo-upcoming'));
db.close();

// 2. Status bar as the other captures have it.
sim(
  'status_bar', udid, 'override',
  '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3',
  '--cellularMode', 'active', '--cellularBars', '4', '--batteryState', 'charged', '--batteryLevel', '100',
);

const SHOTS = [
  { link: 'flyright:///journey/demo-upcoming', name: 'travel-day', settle: 6000 },
  { link: 'flyright:///world', name: 'world', settle: 7000 },
];

for (const appearance of ['light', 'dark']) {
  sim('ui', udid, 'appearance', appearance);
  stop();
  await sleep(800);
  // A cold launch straight onto the deep link, so the World tab fits its
  // camera on the seeded trip and the inset builds fresh.
  sim('openurl', udid, 'flyright:///');
  await sleep(4000);
  for (const shot of SHOTS) {
    sim('openurl', udid, shot.link);
    await sleep(shot.settle);
    const raw = join(work, `${appearance}-${shot.name}-${Date.now()}.png`);
    sim('io', udid, 'screenshot', raw);
    const dest = appearance === 'dark' ? join(OUT, 'dark', `${shot.name}.png`) : join(OUT, `${shot.name}.png`);
    await sharp(raw).resize({ width: 640 }).png({ palette: true }).toFile(dest);
    copyFileSync(raw, join(work, `full-${appearance}-${shot.name}.png`));
    console.log('wrote', dest, 'from', raw);
  }
}
sim('ui', udid, 'appearance', 'light');
console.log('raw frames in', work);
