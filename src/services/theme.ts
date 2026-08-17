import Storage from 'expo-sqlite/kv-store';
import { Appearance } from 'react-native';

/** 'system' means no override: follow the OS-level appearance. */
export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'theme-preference';

export function getThemePreference(): ThemePreference {
  const value = Storage.getItemSync(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function setThemePreference(preference: ThemePreference) {
  Storage.setItemSync(THEME_KEY, preference);
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
}

/** Re-apply the stored override. Must run at module scope in the root layout
 * so the first frame already has the chosen scheme — applying after mount
 * flashes the system theme on launch. */
export function applyStoredTheme() {
  const preference = getThemePreference();
  if (preference !== 'system') Appearance.setColorScheme(preference);
}
