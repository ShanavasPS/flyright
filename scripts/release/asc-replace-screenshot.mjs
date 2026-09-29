// Replace one App Store screenshot in an editable version, keeping the set's order:
//   node scripts/release/asc-replace-screenshot.mjs <appStoreVersionId> <displayType> <position 1-based> <file.png> [locale]
// e.g. node scripts/release/asc-replace-screenshot.mjs 8b3e9eb6-… APP_IPHONE_65 6 store/apple/screenshot/en-US/APP_IPHONE_65/appstore-65-06.png
// Reserve → PUT the upload parts → commit with the MD5 → wait for processing →
// delete the old one → put the new one back at its position. Only while the
// version is editable (deleting returns 409 once it is WAITING_FOR_REVIEW).
import { createHash, createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const [versionId, displayType, positionArg, file, locale = 'en-US'] = process.argv.slice(2);
if (!versionId || !displayType || !positionArg || !file) throw new Error('Usage: <versionId> <displayType> <position> <file> [locale]');
const position = Number(positionArg);

const key = readFileSync(new URL('../../asc-api-key.p8', import.meta.url), 'utf8');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: 'YAW66X6UQF', typ: 'JWT' });
  const body = b64({ iss: '88692f44-a9b2-4f59-8b67-978e93a85dbf', iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' });
  const sig = createSign('SHA256').update(`${head}.${body}`).sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${head}.${body}.${sig}`;
}
async function api(method, path, data) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const locs = await api('GET', `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
const loc = locs.data.find((l) => l.attributes.locale === locale);
if (!loc) throw new Error(`No ${locale} localization`);
const sets = await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?filter[screenshotDisplayType]=${displayType}`);
const set = sets.data[0];
if (!set) throw new Error(`No ${displayType} set`);
const current = (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=20`)).data;
const old = current[position - 1];
if (!old) throw new Error(`Set has ${current.length} screenshots, no position ${position}`);
console.log(`replacing #${position} ${old.attributes.fileName} in ${displayType} (${current.length} shots)`);

const bytes = readFileSync(file);
const reserved = await api('POST', '/v1/appScreenshots', {
  data: {
    type: 'appScreenshots',
    attributes: { fileName: basename(file), fileSize: bytes.length },
    relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } },
  },
});
const shot = reserved.data;
for (const op of shot.attributes.uploadOperations) {
  const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
  const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
  if (!res.ok) throw new Error(`upload part → ${res.status}`);
}
await api('PATCH', `/v1/appScreenshots/${shot.id}`, {
  data: {
    type: 'appScreenshots',
    id: shot.id,
    attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') },
  },
});
for (let i = 0; ; i++) {
  const state = (await api('GET', `/v1/appScreenshots/${shot.id}`)).data.attributes.assetDeliveryState?.state;
  if (state === 'COMPLETE') break;
  if (state === 'FAILED' || i > 60) throw new Error(`processing ${state}`);
  await new Promise((r) => setTimeout(r, 3000));
}
await api('DELETE', `/v1/appScreenshots/${old.id}`);
const order = current.map((s) => (s.id === old.id ? shot.id : s.id));
await api('PATCH', `/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`, {
  data: order.map((id) => ({ type: 'appScreenshots', id })),
});
const after = (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=20`)).data;
console.log('now:', after.map((s, i) => `${i + 1}:${s.attributes.fileName}`).join(' '));
