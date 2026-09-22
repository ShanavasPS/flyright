#!/usr/bin/env node
/**
 * Puts the store-screenshot profile (scripts/store-profile.json) into the
 * state the Home panel is shot in, anchored to now: friends in the air, at
 * the airport and just landed, each with a postcard, on the DEV deployment.
 *
 *   node scripts/seed-store-profile.mjs [--viewer <clerk user id>]
 *
 * Run it right before capturing — the feed only shows postcards from the
 * last 48 hours and the live stages are stamped back from the moment it
 * runs. It resets the store_demo_* friends first (their trips, sessions,
 * postcards and photos, plus the viewer's own demo-* journal rows in the
 * cloud), so re-running never stacks yesterday's trips under today's.
 *
 * The viewer is the config's clerkUserId (else found by name in dev
 * `profiles`, or --viewer). Then seed
 * the viewer's own journal on the device with scripts/seed-demo-data.mjs.
 *
 * --prod seeds the production twin instead (config `prod`): the store
 * people map to four real accounts of Shanavas's, so the profile can be shot
 * signed in on the App Store build. The viewer's journal goes to the cloud
 * too — the dev viewer's synced demo-* rows, re-anchored so the upcoming
 * flight is ~12h out — and the phone pulls it on sign-in; there is no local
 * seed on a physical phone. Names and photos of those accounts live in
 * Clerk (set once with the Clerk API). Only the local-only rows (the Madrid
 * delay's "owed" badge, travel-day stages) do not come across.
 *
 * First-time setup of the viewer (already done; kept for a rebuilt dev
 * instance): sign in on a dev-backend Release build with the config's
 * email (Clerk dev OTP 424242 — the sign-in creates the account), then in
 * Settings → account → Edit profile set the name and pick the photo, after
 * `xcrun simctl addmedia <udid> <photo.jpg>` of the config's viewer photo.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const PROD = argv.includes('--prod');
const flagValue = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};

const config = JSON.parse(readFileSync(new URL('./store-profile.json', import.meta.url)));

/** `npx convex run` against dev (or production with --prod); returns the parsed result. */
function run(fn, args, { prod = PROD } = {}) {
  const out = execFileSync('npx', ['convex', 'run', ...(prod ? ['--prod'] : []), fn, JSON.stringify(args)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}

function findViewer() {
  const rows = execFileSync('npx', ['convex', 'data', 'profiles', '--limit', '1000', '--format', 'jsonLines'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
    .trim()
    .split('\n')
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((row) => row?.name === config.viewer.name && row.userId?.startsWith('user_'));
  if (rows.length !== 1) {
    throw new Error(
      `Expected one dev profile named ${config.viewer.name}, found ${rows.length}. Sign the viewer in once (see the header) or pass --viewer.`,
    );
  }
  return rows[0].userId;
}

const devViewer = config.viewer.clerkUserId ?? findViewer();
const viewer = flagValue('viewer') ?? (PROD ? config.prod.viewer.clerkUserId : devViewer);
/** A store person's id where this run writes: themselves on dev, their
 * production account with --prod. */
const as = (id) => (id === 'viewer' ? viewer : PROD ? (config.prod.people[id]?.clerkUserId ?? id) : id);
if (PROD && config.people.some((p) => !config.prod.people[p.userId])) {
  throw new Error('Every store person needs a production account in store-profile.json → prod.people.');
}
const ids = config.people.map((p) => as(p.userId));
console.log(`viewer ${config.viewer.name} = ${viewer}${PROD ? ' (production)' : ''}`);

const cleared = run('devTools:resetStoreDemo', { demoUserId: viewer, people: ids });
console.log(`reset: ${Array.isArray(cleared) ? cleared.length : 0} rows`);

const people = [];
for (const person of config.people) {
  const { trip, ...rest } = person;
  const posts = [];
  for (const post of trip?.posts ?? []) {
    const { photo, hearts = [], ...fields } = post;
    const storageId = photo ? run('devTools:storeDemoPhoto', { userId: as(person.userId), url: photo }) : undefined;
    posts.push({
      ...fields,
      ...(storageId ? { storageId } : {}),
      hearts: hearts.map(as),
    });
  }
  people.push({ ...rest, userId: as(person.userId), ...(trip ? { trip: { ...trip, posts } } : {}) });
}

const done = run('devTools:seedDemoCircle', { demoUserId: viewer, people });
for (const line of Array.isArray(done) ? done : [done]) console.log(`  ${line}`);

if (PROD) {
  // The viewer's journal: the dev viewer's synced demo-* rows (pushed there
  // by a simulator seeded with seed-demo-data.mjs), shifted so the upcoming
  // flight departs ~12h from now, like a fresh local seed.
  const rows = execFileSync('npx', ['convex', 'data', 'journeys', '--limit', '5000', '--format', 'jsonLines'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
    .trim()
    .split('\n')
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((row) => row?.userId === devViewer && row.naturalKey.startsWith('demo-') && !row.deletedAt);
  const upcoming = rows.find((row) => row.naturalKey === 'demo-upcoming');
  if (!upcoming) throw new Error('The dev viewer has no synced demo journal: seed a signed-in simulator first.');
  const FIVE_MIN = 5 * 60_000;
  const target = Math.ceil((Date.now() + 12 * 3_600_000) / FIVE_MIN) * FIVE_MIN;
  const shift = target - Date.parse(upcoming.scheduledDeparture);
  const moved = (value) => (typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) ? new Date(Date.parse(value) + shift).toISOString() : value);
  const stamp = new Date().toISOString();
  const journal = rows.map((row) => {
    const out = {};
    for (const [key, value] of Object.entries(row)) out[key] = key === 'factsByUser' ? value : moved(value);
    // A boarding pass carries its flight's day of the year (BCBP field 6).
    if (typeof out.passCode === 'string' && out.passCode.length >= 47) {
      const day = new Date(out.scheduledDeparture);
      const doy = Math.round((Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) - Date.UTC(day.getUTCFullYear(), 0, 0)) / 86_400_000);
      out.passCode = out.passCode.slice(0, 44) + String(doy).padStart(3, '0') + out.passCode.slice(47);
    }
    return { ...out, createdAt: out.createdAt, updatedAt: stamp };
  });
  const imported = run('devTools:importDemoJourneys', { userId: viewer, rows: journal });
  console.log(`journal: ${Array.isArray(imported) ? imported.length : 0} trips, upcoming ${new Date(target).toISOString()}`);
}
