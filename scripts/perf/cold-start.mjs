#!/usr/bin/env node
/**
 * Cold-start benchmark on an Android device (scripts/perf/README.md).
 *
 *   node scripts/perf/cold-start.mjs --serial <adb serial> [--runs 10]
 *        [--package com.shanavasshaji.flyright.perf] [--label baseline]
 *
 * Needs a release build made with EXPO_PUBLIC_STARTUP_PROBE=1. Each run
 * force-stops the app, launches it cold, and reads the probe's logcat line:
 * EAS Observe's own startup metrics for that launch, plus `am start -W`'s
 * TotalTime (process start → first frame). Prints each run and the medians,
 * and writes them to scripts/perf/results/<label>.json.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
);
const serial = args.serial;
if (!serial) throw new Error('--serial is required');
const runs = Number(args.runs ?? 10);
const pkg = args.package ?? 'com.shanavasshaji.flyright.perf';
const label = args.label ?? 'run';
const activity = `${pkg}/com.shanavasshaji.flyright.MainActivity`;
const adbPath = process.env.ADB ?? `${homedir()}/Library/Android/sdk/platform-tools/adb`;
const adb = (...a) => execFileSync(adbPath, ['-s', serial, ...a], { encoding: 'utf8' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
for (let i = 0; i < runs; i++) {
  adb('shell', 'am', 'force-stop', pkg);
  await sleep(1500);
  adb('logcat', '-c');
  const out = adb('shell', 'am', 'start', '-W', '-n', activity);
  const totalTime = Number(/TotalTime: (\d+)/.exec(out)?.[1]);
  let probe = null;
  for (let wait = 0; wait < 30 && !probe; wait++) {
    await sleep(1000);
    const lines = adb('logcat', '-d', '-s', 'ReactNativeJS:I').split('\n').filter((l) => l.includes('[startup-probe] '));
    if (!lines.some((l) => l.includes('[startup-probe] end'))) continue;
    probe = {};
    for (const line of lines) {
      const rest = line.slice(line.indexOf('[startup-probe] ') + '[startup-probe] '.length);
      const space = rest.indexOf(' ');
      if (space > 0) probe[rest.slice(0, space)] = JSON.parse(rest.slice(space + 1));
    }
  }
  if (!probe) throw new Error(`run ${i + 1}: no [startup-probe] line — was the build made with EXPO_PUBLIC_STARTUP_PROBE=1?`);
  const row = { totalTime, ...probe.startup };
  results.push({ ...row, probe });
  console.log(`run ${i + 1}:`, JSON.stringify(row));
}

const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const keys = [...new Set(results.flatMap((r) => Object.keys(r).filter((k) => k !== 'probe')))];
const medians = Object.fromEntries(keys.map((k) => [k, median(results.map((r) => r[k]))]));
console.log(`\n${label} — medians over ${runs} cold starts (ms):`);
console.log(JSON.stringify(medians, null, 2));
if (results[0].probe.modules?.count) {
  console.log('\nslowest packages (first run, module self-time ms):');
  console.log(results[0].probe.topPackages.map(([p, ms]) => `  ${String(ms).padStart(7)}  ${p}`).join('\n'));
  console.log('\nslowest modules:');
  console.log(results[0].probe.topModules.map(([p, ms]) => `  ${String(ms).padStart(7)}  ${p}`).join('\n'));
}
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./results/${label}.json`, import.meta.url), JSON.stringify({ label, runs, medians, results }, null, 2));
