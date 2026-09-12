/** Rebuild profile search identities from Clerk. Dry-run unless --apply is
 * supplied; require an explicit deployment. Does not print user data or keys. */
import { spawnSync } from 'node:child_process';
const production = process.argv.includes('--prod');
if (!production && !process.argv.includes('--dev')) throw new Error('Pass --prod or --dev explicitly.');
const apply = process.argv.includes('--apply');
const instance = production ? 'prod' : 'dev';
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}); no record payloads were logged.`);
  return result.stdout;
}
let count = 0, verified = 0;
for (let offset = 0; ; offset += 100) {
  const users = JSON.parse(run('clerk', ['api', `/users?limit=100&offset=${offset}`, '--app', 'app_3Hzr0VFKnIpthtkjwOFbzCtq74C', '--instance', instance]));
  if (!Array.isArray(users)) throw new Error('Unexpected Clerk response');
  for (const user of users) {
    const email = user.email_addresses?.find(item => item.id === user.primary_email_address_id);
    const emailVerified = email?.verification?.status === 'verified';
    count++; if (emailVerified) verified++;
    if (apply) run('npx', ['convex', 'run', ...(production ? ['--prod'] : []), 'users:upsertProfile', JSON.stringify({
      userId: user.id, name: (user.first_name?.trim() || user.username?.trim() || 'A traveler').slice(0, 100),
      imageUrl: user.image_url ?? null, email: emailVerified ? email.email_address : null, emailVerified,
    })]);
  }
  if (users.length < 100) break;
}
console.log(`${apply ? 'Reconciled' : 'Dry-run:'} ${count} ${instance} accounts; ${verified} verified primary emails. No client-supplied addresses were trusted.`);
