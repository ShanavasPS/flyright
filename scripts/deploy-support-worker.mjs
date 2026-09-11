#!/usr/bin/env node
/**
 * Uploads workers/support-mail/dist/worker.js as the `flyright-support-mail`
 * Email Worker, keeping the existing bindings (SUPPORT_INBOX,
 * CONVEX_INBOUND_URLS, INBOUND_SECRET). Build first: `npm run build` in
 * workers/support-mail.
 *
 *   CLOUDFLARE_API_TOKEN=<token with Account → Workers Scripts: Edit> \
 *     node scripts/deploy-support-worker.mjs
 *
 * The token is used for this one request and never written anywhere.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ACCOUNT_ID = '7208c02ab38bb30b08b0f396ae4ad08e';
const SCRIPT = 'flyright-support-mail';
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error('Set CLOUDFLARE_API_TOKEN (Account → Workers Scripts: Edit).');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(resolve(here, '../workers/support-mail/dist/worker.js'), 'utf8');
if (!code.includes('authResults')) {
  console.error('dist/worker.js predates the sender-authentication change — run `npm run build` in workers/support-mail first.');
  process.exit(1);
}

const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT}`;
const headers = { authorization: `Bearer ${token}` };

const settings = await (await fetch(`${base}/settings`, { headers })).json();
if (!settings.success) {
  console.error('Could not read current settings:', JSON.stringify(settings.errors));
  process.exit(1);
}
const compatibility_date = settings.result?.compatibility_date ?? '2025-09-01';

const form = new FormData();
form.append(
  'metadata',
  new Blob(
    [JSON.stringify({ main_module: 'worker.js', compatibility_date, keep_bindings: ['plain_text', 'secret_text'] })],
    { type: 'application/json' },
  ),
);
form.append('worker.js', new Blob([code], { type: 'application/javascript+module' }), 'worker.js');

const put = await (await fetch(base, { method: 'PUT', headers, body: form })).json();
if (!put.success) {
  console.error('Upload failed:', JSON.stringify(put.errors));
  process.exit(1);
}
const after = await (await fetch(`${base}/settings`, { headers })).json();
const names = (after.result?.bindings ?? []).map((b) => b.name).sort();
console.log(`Deployed ${SCRIPT} (${code.length} bytes) at ${put.result?.modified_on}; bindings: ${names.join(', ')}`);
if (!['CONVEX_INBOUND_URLS', 'INBOUND_SECRET', 'SUPPORT_INBOX'].every((n) => names.includes(n))) {
  console.error('WARNING: a binding went missing — re-add it in the dashboard before the next support email arrives.');
  process.exit(2);
}
