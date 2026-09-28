// Promote a versionCode to Play production (completed rollout):
//   node scripts/release/play-promote.mjs <versionCode> <releaseName> <notesFile>
// One edit: PUT the production track, commit, then re-read production.
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const sa = JSON.parse(readFileSync(new URL('../../google-service-account.json', import.meta.url), 'utf8'));
const [code, name, notesFile] = process.argv.slice(2);
if (!code || !name || !notesFile) throw new Error('Usage: node play-promote.mjs <versionCode> <releaseName> <notesFile>');
const notes = readFileSync(notesFile, 'utf8').trim();
if (notes.length > 500) throw new Error(`Release notes are ${notes.length} characters; Play allows 500.`);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
  iss: sa.client_email,
  scope: 'https://www.googleapis.com/auth/androidpublisher',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3000,
})}`;
const assertion = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')}`;
const tok = await (
  await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
  })
).json();
if (!tok.access_token) throw new Error('No Play access token');

const base = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.shanavasshaji.flyright';
const H = { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' };

const edit = await (await fetch(`${base}/edits`, { method: 'POST', headers: H, body: '{}' })).json();
console.log('edit', edit.id);
const put = await fetch(`${base}/edits/${edit.id}/tracks/production`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({
    track: 'production',
    releases: [{ name, versionCodes: [code], status: 'completed', releaseNotes: [{ language: 'en-US', text: notes }] }],
  }),
});
console.log('track', put.status, (await put.text()).slice(0, 300));
if (!put.ok) {
  await fetch(`${base}/edits/${edit.id}`, { method: 'DELETE', headers: H });
  process.exit(1);
}
const commit = await fetch(`${base}/edits/${edit.id}:commit`, { method: 'POST', headers: H });
console.log('commit', commit.status, (await commit.text()).slice(0, 200));

const check = await (await fetch(`${base}/edits`, { method: 'POST', headers: H, body: '{}' })).json();
const track = await (await fetch(`${base}/edits/${check.id}/tracks/production`, { headers: H })).json();
console.log('production now', JSON.stringify(track.releases?.map((r) => ({ name: r.name, codes: r.versionCodes, status: r.status }))));
await fetch(`${base}/edits/${check.id}`, { method: 'DELETE', headers: H });
