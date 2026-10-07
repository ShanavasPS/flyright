#!/usr/bin/env node
/**
 * Put a Helsinki → Tokyo Haneda flight into a production account's journal
 * so that, right now, it is halfway through the air: departed 6 h 45 min
 * ago, landing in 6 h 45 min. The phone's own live card reads the timetable
 * for a manual trip (no provider poll can contradict it), so it shows
 * "In the air · Lands in 6:45" with the plane mid-route on the globe, and
 * the trip carries the airport record the demo shows (terminal, desk,
 * gate, seat, booking, belt) as facts the traveller typed.
 *
 *   node scripts/seed-halfway-flight.mjs <clerk user id> [--dry-run] [--offset-hours 6.75]
 *
 * Runs devTools:insertJourney then devTools:patchJourney on the production
 * deployment. The journey syncs down to every device signed in as that
 * account the next time the app is open. Re-running on the same day patches
 * the same natural key (AY73-<date>) rather than adding a second trip.
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const userId = args.find((a) => !a.startsWith('--'));
if (!userId || !userId.startsWith('user_')) {
  console.error('Usage: node scripts/seed-halfway-flight.mjs user_… [--dry-run] [--offset-hours 6.75]');
  process.exit(1);
}
const dry = args.includes('--dry-run');
const offsetHours = args.includes('--offset-hours') ? Number(args[args.indexOf('--offset-hours') + 1]) : 6.75;
const FLIGHT_HOURS = 13.5;

const FIVE_MIN = 5 * 60_000;
const now = Math.round(Date.now() / FIVE_MIN) * FIVE_MIN;
const departure = new Date(now - offsetHours * 3_600_000);
const arrival = new Date(departure.getTime() + FLIGHT_HOURS * 3_600_000);
// Departure 42 minutes before the scheduled time is nonsense; give the
// record an actual take-off 8 minutes after schedule, as a real leg would.
const actualDeparture = new Date(departure.getTime() + 8 * 60_000);

const journey = {
  userId,
  carrier: 'Finnair',
  carrierCountry: 'FI',
  number: 'AY73',
  fromCode: 'HEL',
  fromCountry: 'FI',
  toCode: 'HND',
  toCountry: 'JP',
  distanceKm: 7839,
  scheduledDeparture: departure.toISOString(),
  scheduledArrival: arrival.toISOString(),
};
const record = {
  source: 'manual',
  seat: '24A',
  bookingReference: 'TY9D3R',
  terminal: '2',
  checkInDesk: 'Area 2',
  gate: '52',
  boardingTime: new Date(departure.getTime() - 40 * 60_000).toISOString(),
  baggageBelt: '12',
  actualDeparture: actualDeparture.toISOString(),
  factsByUser: JSON.stringify(['terminal', 'checkInDesk', 'gate', 'boardingTime', 'baggageBelt']),
};

function run(fn, payload) {
  const cmd = ['convex', 'run', '--prod', fn, JSON.stringify(payload)];
  if (dry) { console.log('npx', cmd.map((c) => (c.includes(' ') ? `'${c}'` : c)).join(' ')); return null; }
  const out = execFileSync('npx', cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out.slice(out.indexOf('{')));
}

console.log(`AY73 HEL → HND for ${userId}: departed ${journey.scheduledDeparture}, lands ${journey.scheduledArrival} (halfway now)`);
const inserted = run('devTools:insertJourney', journey);
if (dry) { run('devTools:patchJourney', { id: '<id from insertJourney>', patch: record }); process.exit(0); }
console.log(`inserted ${inserted.naturalKey} as ${inserted.id}`);
const patched = run('devTools:patchJourney', { id: inserted.id, patch: record });
console.log(`patched: source ${patched.source}, seat ${patched.seat}, gate ${patched.gate}, belt ${patched.baggageBelt}`);
