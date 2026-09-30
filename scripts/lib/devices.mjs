/** Device helpers for scripted simulator/emulator runs (scripts/large-text).
 * Synchronous `run` for short commands, `runLogged` for long Maestro runs
 * whose output goes to a log file instead of this process's memory. */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const adbPath = process.env.ADB ?? join(homedir(), 'Library/Android/sdk/platform-tools/adb');
export const maestroPath = process.env.MAESTRO ?? join(homedir(), '.maestro/bin/maestro');
/** PATH with platform-tools first, for scripts that call a bare `adb`. */
export const toolPath = `${join(homedir(), 'Library/Android/sdk/platform-tools')}:${process.env.PATH}`;

export function run(binary, args, { cwd, env, timeout = 60_000, allowFail = false } = {}) {
  const result = spawnSync(binary, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    encoding: 'utf8',
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (!allowFail && (result.error || result.status !== 0)) {
    const detail = (result.stderr || result.stdout || result.error?.message || '').trim().slice(-600);
    throw new Error(`${binary} ${args.join(' ').slice(0, 160)} failed: ${detail}`);
  }
  return (result.stdout ?? '').trim();
}

export const adb = (serial, args, options) => run(adbPath, ['-s', serial, ...args], options);
export const simctl = (args, options) => run('xcrun', ['simctl', ...args], options);
export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Long-running children, stopped if this process exits first: a stray Maestro
 * keeps holding its device's driver and every later run fails to connect. */
const children = new Set();
process.on('exit', () => children.forEach((child) => child.kill()));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130));

/** Runs a command to completion with stdout/stderr appended to `logFile`. */
export function runLogged(binary, args, logFile, { cwd, env } = {}) {
  return new Promise((done) => {
    const log = createWriteStream(logFile, { flags: 'a' });
    log.write(`\n$ ${binary} ${args.join(' ')}\n`);
    const child = spawn(binary, args, { cwd, env: env ? { ...process.env, ...env } : process.env });
    children.add(child);
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on('close', (code) => {
      children.delete(child);
      log.end(`\n[exit ${code}]\n`);
      done(code ?? 1);
    });
  });
}

/** Maestro against one device; flow env is passed with -e. */
export function maestro(device, flow, env, logFile, options) {
  const args = ['--device', device, 'test', ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), flow];
  // A fresh simulator installs Maestro's XCTest driver first, which can take minutes.
  const driver = { MAESTRO_DRIVER_STARTUP_TIMEOUT: process.env.MAESTRO_DRIVER_STARTUP_TIMEOUT ?? '240000' };
  return runLogged(maestroPath, args, logFile, { ...options, env: { ...driver, ...options?.env } });
}
