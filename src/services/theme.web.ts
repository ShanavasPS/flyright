/** The web theme: react-native-web has no Appearance.setColorScheme, so the
 * choice lives here — in localStorage, behind a tiny store the colour-scheme
 * hook subscribes to. Light by default: the site opens as the daytime app
 * does, and the header's toggle is the one switch. 'system' follows
 * prefers-color-scheme, for the visitor who asks for it in Settings. */
export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'theme-preference';
const listeners = new Set<() => void>();
let current: ThemePreference | null = null;

function read(): ThemePreference {
  try {
    const value = globalThis.localStorage?.getItem(THEME_KEY);
    return value === 'dark' || value === 'system' ? value : 'light';
  } catch {
    return 'light';
  }
}

function emit() {
  for (const listener of listeners) listener();
}

export function getThemePreference(): ThemePreference {
  current ??= read();
  return current;
}

export function setThemePreference(preference: ThemePreference) {
  current = preference;
  try {
    globalThis.localStorage?.setItem(THEME_KEY, preference);
  } catch {
    // Private mode or blocked storage: the choice still holds for this visit.
  }
  emit();
}

/** Nothing to apply up front — the hook reads the stored choice lazily, and
 * the server render is always light so hydration matches the default. */
export function applyStoredTheme() {}

/** The scheme the preference resolves to right now. */
export function resolvedScheme(): 'light' | 'dark' {
  const preference = getThemePreference();
  if (preference !== 'system') return preference;
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Re-runs `listener` when the preference changes, or the OS scheme does
 * while following it. */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  let media: MediaQueryList | null = null;
  try {
    media = globalThis.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
    media?.addEventListener('change', listener);
  } catch {
    media = null;
  }
  return () => {
    listeners.delete(listener);
    media?.removeEventListener('change', listener);
  };
}
