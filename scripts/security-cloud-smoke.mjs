/** Optional integration smoke test on the personal DEV deployment only.
 * Uses temporary synthetic identities, a 1-pixel PNG, and removes their data.
 * Run after `npx convex dev --once`; never pass --prod or real user identities. */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
if (!process.argv.includes('--dev') || process.argv.includes('--prod')) throw new Error('Explicit --dev is required; production is prohibited.');
const suffix = randomUUID().replaceAll('-', '');
const userA = `user_security_a_${suffix}`, userB = `user_security_b_${suffix}`;
function invoke(name, args = {}, subject) {
  const result = spawnSync('npx', ['convex', 'run', '--deployment', 'dev', name, JSON.stringify(args), ...(subject ? ['--identity', JSON.stringify({ subject })] : [])], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${name} failed; record data omitted`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
try {
  invoke('users:syncMyProfile', { name: 'Security fixture', imageUrl: null, email: 'spoof@example.invalid' }, userA);
  assert.deepEqual(invoke('circle:searchPeople', { q: 'spoof@example.invalid' }, userB), []);
  const uploadUrl = invoke('photos:generateUploadUrl', {}, userA);
  const response = await fetch(uploadUrl, { method: 'POST', body: png, headers: { 'Content-Type': 'image/png' } });
  assert.equal(response.status, 200, `Upload returned ${response.status}`);
  const { storageId } = await response.json();
  assert.equal((await fetch(uploadUrl, { method: 'POST', body: png })).status, 403);
  const now = new Date().toISOString();
  const row = { photoId: 'fixture-photo', journeyKey: 'fixture-trip', storageId, width: 1, height: 1, createdAt: now, updatedAt: now, deletedAt: null };
  invoke('photos:push', { rows: [row] }, userA);
  assert.throws(() => invoke('photos:push', { rows: [row] }, userB));
  invoke('users:purge', { userId: userB });
  const mine = invoke('photos:list', {}, userA);
  assert.equal(mine.length, 1);
  assert.equal((await fetch(mine[0].url)).status, 200);
  console.log('DEV smoke passed: verified-email boundary, real photo upload, replay rejection, foreign-file rejection, and account cleanup isolation.');
} finally {
  invoke('users:purge', { userId: userA });
  invoke('users:purge', { userId: userB });
  console.log('Temporary DEV profiles, photos and upload tickets removed.');
}
