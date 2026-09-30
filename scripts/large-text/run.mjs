#!/usr/bin/env node
/** Large-text screenshot run: every screen state in scripts/large-text/screens.json
 * at default text size and above the 1.5x cap, on one iOS simulator and one
 * Android emulator at the same time.
 *
 *   npm run test:large-text -- --ios <sim-udid> --android <serial> \
 *     --ios-app <FlyRight.app> --android-apk <app-release.apk> \
 *     [--pass B,A,C] [--only F10,M05] [--scales normal,cap] [--baseline] [--compare-to <run dir>] [--out <dir>]
 *   npm run test:large-text -- --report-only --out <run dir> [--compare-to <run dir>]
 *
 * Passes: B = fresh install, signed out (B0 onboarding, B empty, B2 seeded);
 * A = signed in as the dev screenshot user with Pro; C = travel day.
 * --baseline captures default text size only, for the drift check against a
 * later capped build (--compare-to). Builds must be Release builds; the
 * Android APK must be debuggable so seed-demo-data.mjs can use run-as.
 * Everything writes to the DEV Convex deployment and Clerk test users only.
 * See docs/release-checks.md → Large text. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadManifest, stateName, statesFor, writePassFlow } from './build-flows.mjs';
import { compareDrift, compareEngages } from './compare.mjs';
import { buildSheet } from './sheet.mjs';
import { checkFontCap } from './font-cap.mjs';
import { adb, maestro, run, simctl, sleep, toolPath } from '../lib/devices.mjs';

const repo = resolve(import.meta.dirname, '../..');
const lib = join(repo, '.maestro/large-text/lib');
const bundle = 'com.shanavasshaji.flyright';
const profile = JSON.parse(readFileSync(join(repo, 'scripts/store-profile.json'), 'utf8')).viewer;
const PASS_GROUPS = { B: ['B0', 'B', 'B2'], A: ['A'], C: ['C'] };
const ENGAGES = ['F10-top', 'F20-top', 'F03-top'];

function iosDevice(udid, app) {
  return {
    platform: 'ios',
    id: udid,
    scales: {
      normal: 'large',
      cap: 'accessibility-extra-large',
      engages: ['accessibility-medium', 'accessibility-extra-large', 'accessibility-extra-extra-extra-large'],
    },
    setScale: (value) => simctl(['ui', udid, 'content_size', value]),
    terminate: () => simctl(['terminate', udid, bundle], { allowFail: true }),
    launch: () => simctl(['launch', udid, bundle]),
    install() {
      simctl(['uninstall', udid, bundle], { allowFail: true });
      // The Clerk session lives in the keychain and survives an uninstall.
      simctl(['keychain', udid, 'reset'], { allowFail: true });
      simctl(['install', udid, app], { timeout: 300_000 });
    },
    version() {
      const container = simctl(['get_app_container', udid, bundle, 'app']);
      return run('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', join(container, 'Info.plist')]);
    },
    fixEnvironment() {
      simctl(['ui', udid, 'appearance', 'light']);
      simctl(['status_bar', udid, 'override', '--time', '9:41', '--batteryState', 'charged', '--batteryLevel', '100', '--wifiBars', '3', '--cellularBars', '4']);
    },
    restore() {
      simctl(['ui', udid, 'content_size', 'large']);
      simctl(['status_bar', udid, 'clear'], { allowFail: true });
    },
    seed: (args) => run('node', ['scripts/seed-demo-data.mjs', '--ios', '--sim', udid, ...args], { cwd: repo, timeout: 120_000 }),
    signIn: (log) => maestro(udid, join(lib, 'ios-sign-in.yaml'), { EMAIL: profile.email }, log),
  };
}

function androidDevice(serial, apk) {
  const shell = (...args) => adb(serial, ['shell', ...args]);
  const animations = (value) => {
    for (const key of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) {
      shell('settings', 'put', 'global', key, value);
    }
  };
  const demo = (...args) => shell('am', 'broadcast', '-a', 'com.android.systemui.demo', ...args);
  return {
    platform: 'android',
    id: serial,
    scales: { normal: '1.0', cap: '2.0', engages: ['1.6', '1.8', '2.0'] },
    setScale: (value) => shell('settings', 'put', 'system', 'font_scale', value),
    terminate: () => shell('am', 'force-stop', bundle),
    launch: () => shell('monkey', '-p', bundle, '-c', 'android.intent.category.LAUNCHER', '1'),
    install() {
      adb(serial, ['uninstall', bundle], { allowFail: true });
      adb(serial, ['install', '-r', apk], { timeout: 300_000 });
      shell('pm', 'grant', bundle, 'android.permission.POST_NOTIFICATIONS');
    },
    version: () => /versionName=(\S+)/.exec(shell('dumpsys', 'package', bundle))?.[1],
    fixEnvironment() {
      animations('0');
      shell('svc', 'power', 'stayon', 'true');
      shell('input', 'keyevent', 'KEYCODE_WAKEUP');
      shell('cmd', 'uimode', 'night', 'no');
      shell('wm', 'density', 'reset');
      shell('settings', 'put', 'global', 'sysui_demo_allowed', '1');
      demo('-e', 'command', 'enter');
      demo('-e', 'command', 'clock', '-e', 'hhmm', '0941');
      demo('-e', 'command', 'notifications', '-e', 'visible', 'false');
      demo('-e', 'command', 'battery', '-e', 'level', '100', '-e', 'plugged', 'false');
    },
    restore() {
      shell('settings', 'put', 'system', 'font_scale', '1.0');
      animations('1');
      demo('-e', 'command', 'exit');
    },
    seed: (args) =>
      run('node', ['scripts/seed-demo-data.mjs', '--android', ...args], {
        cwd: repo,
        env: { ANDROID_SERIAL: serial, PATH: toolPath },
        timeout: 120_000,
      }),
    // Maestro's inputText stalls in Clerk's fields on the emulator, so the
    // address and code are typed with adb, and the address is read back first.
    async signIn(log) {
      let code = await maestro(serial, join(lib, 'android-sign-in-open.yaml'), {}, log);
      if (code) return code;
      // One `input text` of the whole address loses its tail in Clerk's field;
      // short chunks with pauses arrive whole. Read it back before continuing.
      let typed = false;
      for (let attempt = 0; attempt < 3 && !typed; attempt++) {
        shell('input', 'keycombination', '113', '29');
        shell('input', 'keyevent', 'KEYCODE_DEL');
        for (const chunk of profile.email.match(/.{1,5}/g)) {
          shell('input', 'text', chunk);
          await sleep(800);
        }
        await sleep(2500);
        shell('uiautomator', 'dump', '/sdcard/large-text-ui.xml');
        typed = shell('cat', '/sdcard/large-text-ui.xml').includes(`text="${profile.email}"`);
      }
      if (!typed) throw new Error('Android sign-in: the email field did not read back as the test address');
      code = await maestro(serial, join(lib, 'android-sign-in-continue.yaml'), {}, log);
      if (code) return code;
      shell('input', 'text', '424242');
      await sleep(12_000);
      return maestro(serial, join(lib, 'signed-in.yaml'), {}, log);
    },
  };
}

/** Which states produced a screenshot and showed their anchor, the pixel
 * checks, report.json, and the review page (index.html + findings.csv). */
async function writeReport(out, manifest, { platforms, groups, scales, only, report, compareTo }) {
  report.states = [];
  for (const platform of platforms) {
    for (const group of groups) {
      for (const pass of PASS_GROUPS[group]) {
        for (const state of statesFor(manifest, pass, platform, only)) {
          for (const scale of scales) {
            const file = `${stateName(state)}__${scale}.png`;
            const dir = join(out, platform, pass);
            report.states.push({
              platform,
              pass,
              name: stateName(state),
              scale,
              captured: existsSync(join(dir, file)),
              anchorMissed: Boolean(state.anchor) && !existsSync(join(dir, '_seen', file)),
            });
          }
        }
      }
    }
  }
  report.finishedAt = new Date().toISOString();
  report.drift = compareTo ? await compareDrift(out, resolve(compareTo)) : null;
  report.engages = report.baseline ? null : await compareEngages(out, ENGAGES);
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  buildSheet(out, manifest, report);
  const missing = report.states.filter((state) => !state.captured).length;
  console.log(`\n${report.states.length - missing}/${report.states.length} captured. Review: ${join(out, 'index.html')}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      ios: { type: 'string' },
      android: { type: 'string' },
      'ios-app': { type: 'string' },
      'android-apk': { type: 'string' },
      pass: { type: 'string', default: 'B,A,C' },
      only: { type: 'string' },
      baseline: { type: 'boolean', default: false },
      'compare-to': { type: 'string' },
      out: { type: 'string' },
      'report-only': { type: 'boolean', default: false },
      scales: { type: 'string' },
    },
  });
  if (values['report-only']) {
    // Rebuild report.json, the comparisons and the review page for a run
    // folder, e.g. after merging passes captured by separate runs into it.
    const out = resolve(values.out);
    const previous = existsSync(join(out, 'report.json')) ? JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) : {};
    await writeReport(out, loadManifest(), {
      platforms: ['ios', 'android'].filter((platform) => existsSync(join(out, platform))),
      groups: Object.keys(PASS_GROUPS),
      scales: values.baseline ? ['normal'] : ['normal', 'cap'],
      report: {
        version: JSON.parse(readFileSync(join(repo, 'app.json'), 'utf8')).expo.version,
        commit: run('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo }),
        baseline: values.baseline,
        startedAt: previous.startedAt ?? new Date().toISOString(),
        runs: previous.runs ?? [],
        errors: previous.errors ?? [],
      },
      compareTo: values['compare-to'],
    });
    return;
  }
  const devices = [];
  if (values.ios) devices.push(iosDevice(values.ios, values['ios-app']));
  if (values.android) devices.push(androidDevice(values.android, values['android-apk']));
  const groups = values.pass.split(',');
  if (!devices.length || groups.some((group) => !PASS_GROUPS[group])) {
    throw new Error('Usage: npm run test:large-text -- --ios <udid> --android <serial> --ios-app <app> --android-apk <apk> [--pass B,A,C] [--only IDs] [--baseline] [--compare-to <dir>]');
  }
  if (groups.includes('B') && devices.some((device) => !(device.platform === 'ios' ? values['ios-app'] : values['android-apk']))) {
    throw new Error('Pass B installs the app fresh: pass --ios-app and --android-apk');
  }
  if (!values.baseline) checkFontCap();

  const manifest = loadManifest();
  const version = JSON.parse(readFileSync(join(repo, 'app.json'), 'utf8')).expo.version;
  const stamp = new Date().toISOString().slice(0, 16).replaceAll(':', '-');
  const out = resolve(values.out ?? join(repo, '.maestro/out/large-text', `${stamp}${values.baseline ? '-baseline' : ''}`));
  const flows = join(out, '_flows');
  mkdirSync(flows, { recursive: true });
  const ctx = {
    manifest,
    out,
    flows,
    only: values.only?.split(','),
    scales: values.scales?.split(',') ?? (values.baseline ? ['normal'] : ['normal', 'cap']),
    report: {
      version,
      commit: run('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo }),
      baseline: values.baseline,
      startedAt: new Date().toISOString(),
      runs: [],
      errors: [],
    },
  };
  const log = (device) => join(out, `${device.platform}.log`);

  async function capture(device, pass, scale) {
    const shots = join(out, device.platform, pass);
    mkdirSync(join(shots, '_seen'), { recursive: true });
    const flow = writePassFlow(manifest, pass, device.platform, flows, ctx.only);
    if (!flow) return;
    device.setScale(device.scales[scale]);
    device.terminate();
    const started = Date.now();
    const exit = await maestro(device.id, flow, { SHOTS: shots, SCALE: scale }, log(device));
    ctx.report.runs.push({ platform: device.platform, pass, scale, exit, seconds: Math.round((Date.now() - started) / 1000) });
    console.log(`${device.platform} ${pass} ${scale}: done (maestro exit ${exit})`);
  }

  /** The app must have created its database before seed-demo-data.mjs can write it. */
  async function seed(device, args) {
    device.launch();
    await sleep(15_000);
    device.terminate();
    device.seed(args);
  }

  async function signedOut(device) {
    for (const scale of ctx.scales) {
      device.install();
      await capture(device, 'B0', scale);
      await maestro(device.id, join(lib, 'skip-onboarding.yaml'), {}, log(device));
      await capture(device, 'B', scale);
      await seed(device, ['--future']);
      await capture(device, 'B2', scale);
    }
  }

  async function signedIn(device) {
    device.setScale(device.scales.normal);
    if ((await maestro(device.id, join(lib, 'signed-in.yaml'), {}, log(device))) !== 0) {
      if ((await device.signIn(log(device))) !== 0) throw new Error(`${device.platform}: sign-in failed, see ${log(device)}`);
    }
    for (const scale of ctx.scales) {
      // Reseeding clears the claim C02 files, so C01 starts empty at both sizes.
      await seed(device, ['--future']);
      await capture(device, 'A', scale);
    }
    if (!values.baseline) await engages(device);
  }

  /** The same three screens at three sizes above the cap must render identically. */
  async function engages(device) {
    const shots = join(out, device.platform, 'engages');
    mkdirSync(join(shots, '_seen'), { recursive: true });
    mkdirSync(join(flows, 'engages'), { recursive: true });
    const flow = writePassFlow(
      { states: manifest.states.filter((state) => state.pass === 'A' && ENGAGES.includes(stateName(state))) },
      'A',
      device.platform,
      join(flows, 'engages'),
    );
    for (const [index, value] of device.scales.engages.entries()) {
      device.setScale(value);
      device.terminate();
      await maestro(device.id, flow, { SHOTS: shots, SCALE: `size${index + 1}` }, log(device));
    }
  }

  async function travelDay(device) {
    for (const scale of ctx.scales) {
      await seed(device, ['--travel-day']);
      await capture(device, 'C', scale);
    }
  }

  const each = (step) =>
    Promise.all(
      devices.map((device) =>
        step(device).catch((error) => {
          ctx.report.errors.push({ platform: device.platform, error: error.message });
          console.error(`${device.platform}: ${error.message}`);
        }),
      ),
    );

  for (const device of devices) {
    device.fixEnvironment();
    if (!groups.includes('B')) {
      const installed = device.version();
      if (installed !== version) throw new Error(`${device.platform} has ${installed} installed, app.json says ${version}`);
    }
  }
  try {
    if (groups.includes('B')) await each(signedOut);
    if (groups.includes('A') || groups.includes('C')) {
      // Friends, postcards and Pro for the screenshot user, on DEV only.
      run('node', ['scripts/seed-store-profile.mjs'], { cwd: repo, timeout: 300_000 });
      run('npx', ['convex', 'run', 'devTools:setPro', JSON.stringify({ userId: profile.clerkUserId, proUntil: '2099-01-01T00:00:00Z' })], { cwd: repo, timeout: 120_000 });
    }
    if (groups.includes('A')) await each(signedIn);
    if (groups.includes('C')) await each(travelDay);
  } finally {
    for (const device of devices) device.restore();
  }

  await writeReport(out, manifest, {
    platforms: devices.map((device) => device.platform),
    groups,
    scales: ctx.scales,
    only: ctx.only,
    report: ctx.report,
    compareTo: values['compare-to'],
  });
  if (ctx.report.errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
