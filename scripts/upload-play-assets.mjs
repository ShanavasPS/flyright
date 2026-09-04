/**
 * Uploads Play Store listing images (phone/7"/10" screenshots, icon, feature
 * graphic) from store-assets/ via the Play Developer API, authenticated with
 * ./google-service-account.json (the same account `eas submit` uses).
 * Run after regenerating assets:  node scripts/upload-play-assets.mjs
 */
import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const PACKAGE = 'com.shanavasshaji.flyright';
const LANGUAGE = 'en-US';
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3';

/** All six panels the generator produces — the listing carries the whole set,
 *  so a shorter list here would silently drop the last two on every upload. */
const PANELS = [1, 2, 3, 4, 5, 6];
const IMAGE_SETS = {
  phoneScreenshots: PANELS.map((n) => `phone-0${n}.png`),
  sevenInchScreenshots: PANELS.map((n) => `tablet7-0${n}.png`),
  tenInchScreenshots: PANELS.map((n) => `tablet10-0${n}.png`),
  icon: ['play-icon-512.png'],
  featureGraphic: ['feature-graphic-1024x500.png'],
};

const b64url = (data) =>
  (Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data)))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function accessToken() {
  const key = JSON.parse(await readFile('google-service-account.json', 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key);
  const jwt = `${unsigned}.${b64url(signature)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`token exchange failed: ${JSON.stringify(json)}`);
  return json.access_token;
}

const token = await accessToken();
const authed = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${options.method ?? 'GET'} ${url} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
};

const edit = await authed(`${API}/applications/${PACKAGE}/edits`, { method: 'POST' });
console.log('opened edit', edit.id);

for (const [type, files] of Object.entries(IMAGE_SETS)) {
  // images.deleteall is a DELETE on the imageType collection itself.
  await authed(`${API}/applications/${PACKAGE}/edits/${edit.id}/listings/${LANGUAGE}/${type}`, {
    method: 'DELETE',
  });
  const remaining = await authed(
    `${API}/applications/${PACKAGE}/edits/${edit.id}/listings/${LANGUAGE}/${type}`,
  );
  if (remaining.images?.length) throw new Error(`${type}: deleteall left ${remaining.images.length} images`);
  for (const file of files) {
    const body = await readFile(`store-assets/${file}`);
    await authed(
      `${UPLOAD}/applications/${PACKAGE}/edits/${edit.id}/listings/${LANGUAGE}/${type}?uploadType=media`,
      { method: 'POST', headers: { 'Content-Type': 'image/png' }, body },
    );
    console.log(`uploaded ${type}/${file}`);
  }
}

await authed(`${API}/applications/${PACKAGE}/edits/${edit.id}:commit`, { method: 'POST' });
console.log('edit committed — Play listing images updated');
