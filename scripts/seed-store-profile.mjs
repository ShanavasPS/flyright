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
 * First-time setup of the viewer (already done; kept for a rebuilt dev
 * instance): sign in on a dev-backend Release build with the config's
 * email (Clerk dev OTP 424242 — the sign-in creates the account), then in
 * Settings → account → Edit profile set the name and pick the photo, after
 * `xcrun simctl addmedia <udid> <photo.jpg>` of the config's viewer photo.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
if (argv.includes('--prod')) throw new Error('The store profile is dev-only: synthetic people never go to production.');
const flagValue = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};

const config = JSON.parse(readFileSync(new URL('./store-profile.json', import.meta.url)));

/** `npx convex run` against the dev deployment; returns the parsed result. */
function run(fn, args) {
  const out = execFileSync('npx', ['convex', 'run', fn, JSON.stringify(args)], {
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

const viewer = flagValue('viewer') ?? config.viewer.clerkUserId ?? findViewer();
const ids = config.people.map((p) => p.userId);
console.log(`viewer ${config.viewer.name} = ${viewer}`);

const cleared = run('devTools:resetStoreDemo', { demoUserId: viewer, people: ids });
console.log(`reset: ${Array.isArray(cleared) ? cleared.length : 0} rows`);

const people = [];
for (const person of config.people) {
  const { trip, ...rest } = person;
  const posts = [];
  for (const post of trip?.posts ?? []) {
    const { photo, hearts = [], ...fields } = post;
    const storageId = photo ? run('devTools:storeDemoPhoto', { userId: person.userId, url: photo }) : undefined;
    posts.push({
      ...fields,
      ...(storageId ? { storageId } : {}),
      hearts: hearts.map((id) => (id === 'viewer' ? viewer : id)),
    });
  }
  people.push({ ...rest, ...(trip ? { trip: { ...trip, posts } } : {}) });
}

const done = run('devTools:seedDemoCircle', { demoUserId: viewer, people });
for (const line of Array.isArray(done) ? done : [done]) console.log(`  ${line}`);
