/** Writes scripts/lounges/directory.json to Convex, one airport at a time
 * (loungesInternal.replaceAirport). Development by default; pass --prod for
 * production, only after the owner has checked the entries (docs/lounges.md).
 * Usage: node scripts/lounges/seed.mjs [--prod] [HEL DOH …] */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const prod = args.includes('--prod');
const only = args.filter((a) => a !== '--prod');
const directory = JSON.parse(readFileSync(new URL('./directory.json', import.meta.url), 'utf8'));

for (const [airport, lounges] of Object.entries(directory)) {
  if (only.length && !only.includes(airport)) continue;
  const out = execFileSync(
    'npx',
    ['convex', 'run', ...(prod ? ['--prod'] : []), 'loungesInternal:replaceAirport', JSON.stringify({ airport, lounges })],
    { encoding: 'utf8' },
  );
  process.stdout.write(out);
}
