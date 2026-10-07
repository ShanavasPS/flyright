#!/usr/bin/env node
/**
 * Make the halfway Helsinki → Haneda trip (scripts/seed-halfway-flight.mjs)
 * live for the account on the server: Pro on the Convex entitlement, and an
 * active live session in the 'departed' stage with the walk stamped back
 * from take-off, dressed with the same airport record, so the circle's
 * People and Updates surfaces show her in the air and the share link works.
 * The account must be a screenshot account (convex/devTools.ts
 * SCREENSHOT_ACCOUNTS) — openLiveSession refuses anyone else.
 *
 *   node scripts/seed-halfway-live.mjs <clerk user id> --departure 2026-09-25T07:30:00.000Z [--key AY73-2026-09-25] [--dry-run]
 *
 * The phone starts its own Live Activity when the app next runs signed in as
 * the account, from the journey's timetable (services/travel-day-lifecycle):
 * it needs Pro on the device and Travel day left on in Settings.
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const userId = args.find((a) => !a.startsWith('--'));
if (!userId || !userId.startsWith('user_')) {
  console.error('Usage: node scripts/seed-halfway-live.mjs user_… --departure <ISO> [--key AY73-YYYY-MM-DD] [--dry-run]');
  process.exit(1);
}
const dry = args.includes('--dry-run');
const today = new Date().toISOString().slice(0, 10);
const naturalKey = args.includes('--key') ? args[args.indexOf('--key') + 1] : `AY73-${today}`;

function run(fn, payload) {
  const cmd = ['convex', 'run', '--prod', fn, JSON.stringify(payload)];
  if (dry) { console.log('npx', cmd.map((c) => (c.includes(' ') ? `'${c}'` : c)).join(' ')); return null; }
  const out = execFileSync('npx', cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const start = out.indexOf('{');
  return start >= 0 ? JSON.parse(out.slice(start)) : out;
}

// 1. Pro until the end of the year, so live monitoring and the heads-up
//    machinery treat the account as paid.
run('devTools:setPro', { userId, proUntil: '2026-12-31T23:59:59Z' });

// 2. The live session, departed. Stamps walk back from take-off the way a
//    real travel day would have: at the airport two hours out, checked in,
//    bag dropped, through security, boarded 35 minutes before departure,
//    departed eight minutes after the scheduled time.
// The journey's scheduled departure, as seed-halfway-flight.mjs printed it.
const departureArg = args.includes('--departure') ? args[args.indexOf('--departure') + 1] : null;
if (!departureArg || Number.isNaN(Date.parse(departureArg))) {
  console.error('Pass --departure <ISO> — the scheduled departure seed-halfway-flight.mjs printed.');
  process.exit(1);
}
const departure = Date.parse(departureArg);
const at = (minutesFromDeparture) => new Date(departure + minutesFromDeparture * 60_000).toISOString();
const stamps = {
  at_airport: at(-120),
  checked_in: at(-110),
  bag_dropped: at(-100),
  security: at(-85),
  boarded: at(-35),
  departed: at(8),
};
const opened = run('devTools:openLiveSession', { userId, naturalKey, stage: 'departed', stamps });
if (dry) {
  run('devTools:patchLiveSession', { sessionId: '<sessionId from openLiveSession>', patch: { flightStatus: 'active', terminal: '2', gate: '52', baggageBelt: '12', actualDeparture: stamps.departed, lastCheckedAt: new Date().toISOString() } });
  process.exit(0);
}
console.log(`session ${opened.sessionId} open for ${naturalKey}, share token ${opened.shareToken}`);

// 3. Dress it like the demo circle seed does for a departed leg.
const patched = run('devTools:patchLiveSession', {
  sessionId: opened.sessionId,
  patch: {
    flightStatus: 'active',
    terminal: '2',
    gate: '52',
    baggageBelt: '12',
    delayMinutes: null,
    actualDeparture: stamps.departed,
    lastCheckedAt: new Date().toISOString(),
  },
});
console.log(`session ${patched.status}: stage ${patched.currentStage}, ${patched.fromCode}→${patched.toCode}, departed ${patched.actualDeparture}`);
