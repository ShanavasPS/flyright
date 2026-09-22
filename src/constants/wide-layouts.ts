/**
 * Which wide-window layouts are on (see docs/wide-layouts-plan.md).
 *
 * Each surface that gains a list + detail split on a wide window has a
 * switch, so one that misbehaves can go dark without touching the others.
 * The defaults below ship in the binary; `/api/app-version` may override any
 * of them (`layouts` in its answer, from the WIDE_LAYOUTS env var), which is
 * how a switch goes off after release without a new build — and how the
 * iPhone Duo's mirrored order goes on once it has been seen on the device.
 *
 * A switch only ever decides between two layouts that both exist and both
 * work: off means the window gets the single-column screen phones get.
 */

export type WideLayoutKey = 'flights' | 'claims' | 'friends' | 'updates' | 'world' | 'duoMirror';

export const WIDE_LAYOUT_KEYS: readonly WideLayoutKey[] = [
  'flights',
  'claims',
  'friends',
  'updates',
  'world',
  'duoMirror',
];

export type WideLayoutSwitches = Record<WideLayoutKey, boolean>;

/** The binary's own answer. `duoMirror` stays off until the Duo's
 * cover-to-open behaviour has been checked on the real device. */
export const WIDE_LAYOUT_DEFAULTS: WideLayoutSwitches = {
  flights: true,
  claims: true,
  friends: true,
  updates: true,
  world: true,
  duoMirror: false,
};

const isKey = (key: string): key is WideLayoutKey =>
  (WIDE_LAYOUT_KEYS as readonly string[]).includes(key);

/** A server answer's `layouts`, kept only where it is a known key with a
 * boolean value. Anything else — missing, malformed, an old server — is no
 * override at all. */
export function parseLayoutOverrides(raw: unknown): Partial<WideLayoutSwitches> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Partial<WideLayoutSwitches> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isKey(key) && typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/** The switches in force: the binary's defaults, then the server's word. */
export function resolveLayoutSwitches(raw: unknown): WideLayoutSwitches {
  return { ...WIDE_LAYOUT_DEFAULTS, ...parseLayoutOverrides(raw) };
}

/** The server side: `WIDE_LAYOUTS=duoMirror:on,world:off` → an override
 * object. Unknown keys and values other than on/off are dropped, so a typo
 * in the env var changes nothing rather than switching something off. */
export function parseLayoutEnv(value: string | undefined): Partial<WideLayoutSwitches> {
  const out: Partial<WideLayoutSwitches> = {};
  for (const part of (value ?? '').split(',')) {
    const [key, state] = part.split(':').map((s) => s.trim());
    if (!key || !isKey(key)) continue;
    if (state === 'on') out[key] = true;
    else if (state === 'off') out[key] = false;
  }
  return out;
}
