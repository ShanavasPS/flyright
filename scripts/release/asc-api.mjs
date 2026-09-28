// Tiny App Store Connect client (key, issuer and team ids as in AGENTS.md): node scripts/release/asc-api.mjs GET|POST|PATCH|DELETE <path> [jsonBody]
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
const key = readFileSync(new URL('../../asc-api-key.p8', import.meta.url), 'utf8');
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: 'ES256', kid: 'YAW66X6UQF', typ: 'JWT' });
const body = b64({ iss: '88692f44-a9b2-4f59-8b67-978e93a85dbf', iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' });
const sig = createSign('SHA256').update(`${head}.${body}`).sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
const jwt = `${head}.${body}.${sig}`;
const [method, path, data] = process.argv.slice(2);
const url = path.startsWith('http') ? path : `https://api.appstoreconnect.apple.com${path}`;
const res = await fetch(url, { method, headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: data });
const text = await res.text();
console.log(res.status, text);
