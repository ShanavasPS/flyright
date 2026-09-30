/** Turns scripts/large-text/screens.json into one Maestro flow per pass and
 * platform. Every state cold-starts the app (data kept), opens its link, runs
 * its steps, waits for its anchor, and takes `<ID>-<state>__${SCALE}.png` in
 * ${SHOTS}. A state is optional, so one bad anchor never stops the pass; a
 * state whose anchor showed also leaves a marker in ${SHOTS}/_seen/. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '../..');
const lib = join(repo, '.maestro/large-text/lib');

export function loadManifest() {
  return JSON.parse(readFileSync(join(repo, 'scripts/large-text/screens.json'), 'utf8'));
}

export const stateName = (state) => `${state.id}-${state.state}`;

/** The states a pass runs on a platform, in manifest order, minus skipped ones. */
export function statesFor(manifest, pass, platform, only) {
  return manifest.states.filter(
    (state) =>
      state.pass === pass &&
      !state.skip &&
      (!state.platforms || state.platforms.includes(platform)) &&
      (!only || only.includes(state.id)),
  );
}

const selector = (target) => (target.id ? { id: target.id } : target.text);

function commandsFor(state, platform) {
  const name = stateName(state);
  const commands = [{ launchApp: { stopApp: true } }];
  // Android drops a link sent before the router is up: wait for the tab bar.
  if (platform === 'android') commands.push({ extendedWaitUntil: { visible: 'Flights', timeout: 20000, optional: true } });
  if (state.link) commands.push({ openLink: state.link });
  commands.push(...(state.steps ?? []));
  if (state.anchor) {
    // Maestro has no try/catch: an optional inner flow leaves a _seen marker
    // only when the anchor shows, so the report can flag states that didn't.
    commands.push({
      runFlow: {
        optional: true,
        commands: [
          // The Android emulator cold-starts a release build far slower than
          // the simulator: its screens need twice as long to fill in.
          { extendedWaitUntil: { visible: selector(state.anchor), timeout: platform === 'android' ? 30000 : 15000 } },
          { takeScreenshot: `\${SHOTS}/_seen/${name}__\${SCALE}` },
        ],
      },
    });
  }
  if (state.scrollTo) {
    commands.push({
      scrollUntilVisible: { element: selector(state.scrollTo), direction: 'DOWN', timeout: 20000, optional: true },
    });
  }
  commands.push({ waitForAnimationToEnd: { timeout: 5000 } }, { takeScreenshot: `\${SHOTS}/${name}__\${SCALE}` });
  return commands;
}

/** Writes the pass flow and returns its path, or null when the pass is empty. */
export function writePassFlow(manifest, pass, platform, directory, only) {
  const states = statesFor(manifest, pass, platform, only);
  if (!states.length) return null;
  // System prompts (tracking, notifications) appear once per install, so they
  // are cleared once up front rather than checked before every state.
  const steps = [
    { launchApp: { stopApp: true } },
    { runFlow: join(lib, 'prompts.yaml') },
    ...states.map((state) => ({
      runFlow: { label: stateName(state), optional: true, commands: commandsFor(state, platform) },
    })),
  ];
  // JSON is valid YAML, so the commands need no hand-written YAML emitter.
  const file = join(directory, `${platform}-${pass}.yaml`);
  writeFileSync(file, `appId: com.shanavasshaji.flyright\n---\n${JSON.stringify(steps, null, 2)}\n`);
  return file;
}
