/**
 * Pull the EAS remote build numbers (appVersionSource: remote) into app.json
 * so local dev builds show the same build number as the latest store build.
 * `eas build:version:sync` can't do this for CNG projects — it only writes to
 * checked-in native files. EAS cloud builds ignore these local values.
 *
 * Usage: npm run sync-versions
 * Then:  npx expo prebuild && npx expo run:ios
 * (run:ios alone may not re-run prebuild for this change, leaving the old
 * number in the native project)
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const remote = JSON.parse(
  execSync('npx eas-cli build:version:get -p all --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
);

const path = new URL('../app.json', import.meta.url);
const config = JSON.parse(readFileSync(path, 'utf8'));

if (remote.buildNumber) config.expo.ios.buildNumber = remote.buildNumber;
if (remote.versionCode) config.expo.android.versionCode = Number(remote.versionCode);

writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
console.log(
  `Synced app.json: ios.buildNumber=${remote.buildNumber}, android.versionCode=${remote.versionCode}`,
);
console.log('Apply to local builds with: npx expo prebuild && npx expo run:ios');
