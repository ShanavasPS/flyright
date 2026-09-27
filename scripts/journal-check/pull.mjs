/** Pulls journals read-only from production into a temp file for
 * journal.test.ts, then runs it. Usage: npm run release:journal -- "<name>"
 * (a profile name, default the owner's). Writes nothing to Convex; the file
 * stays in the OS temp dir and is deleted after the run. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const name = process.argv[2] ?? 'Shanavas';
const dir = mkdtempSync(join(tmpdir(), 'flyright-journal-'));
const file = join(dir, 'journal.json');
try {
  const out = execFileSync('npx', ['convex', 'run', '--prod', 'devTools:inspectItinerary', JSON.stringify({ nameLike: name })], { encoding: 'utf8' });
  writeFileSync(file, out, { mode: 0o600 });
  execFileSync('npx', ['jest', 'scripts/journal-check/journal.test.ts'], {
    stdio: 'inherit', env: { ...process.env, FLYRIGHT_JOURNAL: file },
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
