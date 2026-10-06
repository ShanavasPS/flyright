/** Lists lounge entries last checked more than 90 days ago (decision 7 in
 * docs/lounges.md). Run before each release; exits 1 when any are stale.
 * Usage: node scripts/lounges/check.mjs [--days 90] */
import { readFileSync } from 'node:fs';

const at = process.argv.indexOf('--days');
const days = at > 0 ? Number(process.argv[at + 1]) : 90;
const directory = JSON.parse(readFileSync(new URL('./directory.json', import.meta.url), 'utf8'));
const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

const stale = Object.values(directory)
  .flat()
  .filter((lounge) => lounge.checkedOn < cutoff);
for (const lounge of stale) console.log(`${lounge.checkedOn}  ${lounge.loungeId}  ${lounge.source}`);
console.log(stale.length ? `${stale.length} lounge(s) older than ${days} days: check them against the source.` : `All lounges checked within ${days} days.`);
process.exit(stale.length ? 1 : 0);
