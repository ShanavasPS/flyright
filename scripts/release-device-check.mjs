/** Run both native platforms, retain application data, and save evidence.
 * --mode native: dev binaries, real file/upload regressions, no cloud writes.
 * --mode candidate: installed release binaries, already signed-in test account.
 * iOS requires a simulator; Maestro does not support physical iPhones. */
import { spawn, spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { root, verifyBackend } from './check-backend-contract.mjs';

function command(binary, args) {
  const result = spawnSync(binary, args, { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${binary} ${args.slice(0, 3).join(' ')} failed; verify device access`);
  return result.stdout.trim();
}

async function main() {
  const { values } = parseArgs({ options: {
    ios: { type: 'string' }, android: { type: 'string' }, mode: { type: 'string' },
    'account-email': { type: 'string' }, 'journey-id': { type: 'string' },
  } });
  if (!values.ios || !values.android || !['native', 'candidate'].includes(values.mode)) throw new Error('Usage: npm run release:devices -- --ios <sim-udid> --android <serial> --mode native|candidate [--account-email <test-email> --journey-id <retained-trip-id>]');
  if (values.mode === 'candidate' && (!values['account-email'] || !values['journey-id'])) throw new Error('Candidate checks require the dedicated test account email and a retained trip ID. They never sign in or clear data automatically.');
  const app = JSON.parse(await readFile(resolve(root, 'app.json'), 'utf8')).expo;
  const packageId = app.android.package;
  const bundleId = app.ios.bundleIdentifier;
  const adb = process.env.ADB ?? join(homedir(), 'Library/Android/sdk/platform-tools/adb');
  const maestro = process.env.MAESTRO ?? join(homedir(), '.maestro/bin/maestro');
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const output = resolve(root, '.maestro/out/release', stamp);
  await mkdir(output, { recursive: true });
  const report = { version: app.version, commit: command('git', ['rev-parse', 'HEAD']), sourceDirty: Boolean(command('git', ['status', '--porcelain'])), mode: values.mode, startedAt: new Date().toISOString(), devices: [], passed: false };
  let server;
  let reversed = false;
  try {
    // Query live metadata on every run, not a previous successful JSON report.
    report.backend = verifyBackend(values.mode === 'candidate' ? 'prod' : 'dev');
    const sims = JSON.parse(command('xcrun', ['simctl', 'list', 'devices', '--json']));
    const simulator = Object.values(sims.devices).flat().find(device => device.udid === values.ios && device.state === 'Booted');
    if (!simulator) throw new Error('The iOS target must be a booted simulator. Physical iPhone verification needs XCTest/Appium or an observed device check; do not label a simulator run as physical coverage.');
    const iosPath = command('xcrun', ['simctl', 'get_app_container', values.ios, bundleId, 'app']);
    const plist = JSON.parse(command('plutil', ['-convert', 'json', '-o', '-', join(iosPath, 'Info.plist')]));
    if (plist.CFBundleShortVersionString !== app.version || String(plist.CFBundleVersion) !== String(app.ios.buildNumber)) throw new Error(`iOS binary is stale: ${plist.CFBundleShortVersionString} (${plist.CFBundleVersion}), expected ${app.version} (${app.ios.buildNumber}). Prebuild and reinstall.`);
    const androidState = command(adb, ['-s', values.android, 'get-state']);
    if (androidState !== 'device') throw new Error('Android device is not ready');
    const info = command(adb, ['-s', values.android, 'shell', 'dumpsys', 'package', packageId]);
    const version = /versionName=([^\s]+)/.exec(info)?.[1];
    const build = /versionCode=(\d+)/.exec(info)?.[1];
    if (version !== app.version || build !== String(app.android.versionCode)) throw new Error(`Android binary is stale: ${version} (${build}), expected ${app.version} (${app.android.versionCode}). Prebuild and reinstall.`);
    const physicalAndroid = command(adb, ['-s', values.android, 'shell', 'getprop', 'ro.kernel.qemu']) !== '1';
    if (values.mode === 'candidate') {
      if (/\bDEBUGGABLE\b/.test(info)) throw new Error('Candidate checks require an Android release binary, not the Metro development app.');
      const iosBundle = await readFile(join(iosPath, 'main.jsbundle')).catch(() => null);
      if (!iosBundle?.includes('https://limitless-oyster-269.convex.cloud') || !iosBundle.includes('pk_live_') || iosBundle.includes('https://watchful-swordfish-508.convex.cloud')) throw new Error('The iOS candidate must bundle production Convex/Clerk configuration. A development or missing JS bundle cannot pass.');
      const apkPath = command(adb, ['-s', values.android, 'shell', 'pm', 'path', packageId]).split('\n').find(line => line.endsWith('/base.apk'))?.slice('package:'.length);
      if (!apkPath) throw new Error('Could not locate the installed Android candidate');
      const apk = join(output, 'candidate.apk');
      command(adb, ['-s', values.android, 'pull', apkPath, apk]);
      const androidBundle = spawnSync('unzip', ['-p', apk, 'assets/index.android.bundle'], { maxBuffer: 64 * 1024 * 1024 });
      if (androidBundle.status !== 0 || !androidBundle.stdout.includes('https://limitless-oyster-269.convex.cloud') || !androidBundle.stdout.includes('pk_live_') || androidBundle.stdout.includes('https://watchful-swordfish-508.convex.cloud')) throw new Error('The Android candidate must bundle production Convex/Clerk configuration.');
    }

    let requests = [];
    if (values.mode === 'native') {
      const metro = await fetch('http://127.0.0.1:8081/status', { signal: AbortSignal.timeout(3000) }).catch(() => null);
      if (!metro?.ok || !(await metro.text()).includes('packager-status:running')) throw new Error('Start FlyRight Metro with IPv4 access on port 8081 before native checks: npx expo start --clear --port 8081');
      server = createServer(async (request, response) => {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const bytes = Buffer.concat(chunks);
        requests.push({ path: request.url, validBody: bytes.equals(Buffer.from([255, 216, 255, 217])) });
        response.writeHead(request.url === '/unavailable' ? 503 : 200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ storageId: 'release-check-photo' }));
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(18765, '127.0.0.1', resolve); });
      command(adb, ['-s', values.android, 'reverse', 'tcp:18765', 'tcp:18765']);
      reversed = true;
    }
    const flow = values.mode === 'native' ? '.maestro/release-native-photo.yaml' : '.maestro/release-signed-in.yaml';
    for (const target of [{ platform: 'ios', device: values.ios, physical: false, build: plist.CFBundleVersion }, { platform: 'android', device: values.android, physical: physicalAndroid, build }]) {
      requests = [];
      const shots = join(output, target.platform);
      await mkdir(shots, { recursive: true });
      const args = ['--device', target.device, 'test', '--format', 'JUNIT', '--output', join(shots, 'results.xml'), '--debug-output', shots, '-e', `SHOTS=${shots}`];
      if (values.mode === 'candidate') args.push('-e', `ACCOUNT_EMAIL=${values['account-email'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, '-e', `JOURNEY_ID=${values['journey-id']}`);
      args.push(flow);
      console.log(`Running ${values.mode} checks on ${target.platform} (${target.physical ? 'physical device' : 'simulator/emulator'})…`);
      // Keep the event loop free to receive native photo requests while Maestro runs.
      const status = await new Promise((resolve, reject) => {
        const child = spawn(maestro, args, { cwd: root, stdio: 'inherit' });
        const timer = setTimeout(() => child.kill('SIGTERM'), 8 * 60_000);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', code => { clearTimeout(timer); resolve(code); });
      });
      const observed = { ...target, passed: status === 0, uploads: [...requests] };
      report.devices.push(observed);
      if (status !== 0) throw new Error(`${target.platform} Maestro check failed. Evidence: ${shots}`);
      if (values.mode === 'native' && (requests.length !== 3 || requests.filter(r => r.path === '/upload').length !== 2 || requests.filter(r => r.path === '/unavailable').length !== 1 || requests.some(r => !r.validBody))) {
        observed.passed = false;
        throw new Error(`${target.platform}: unexpected native upload requests; missing/empty files must never reach the network`);
      }
    }
    report.passed = true;
    console.log(`Both platforms passed. Evidence: ${output}`);
  } catch (error) {
    report.error = error.message;
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    try {
      if (reversed) command(adb, ['-s', values.android, 'reverse', '--remove', 'tcp:18765']);
    } finally {
      if (server) await new Promise(resolve => server.close(resolve));
    }
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
