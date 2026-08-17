/** react-native-web has no Appearance.setColorScheme — web follows the OS
 * theme via prefers-color-scheme, and Settings hides the appearance row. */
export type ThemePreference = 'system' | 'light' | 'dark';

export function getThemePreference(): ThemePreference {
  return 'system';
}

export function setThemePreference(_preference: ThemePreference) {}

export function applyStoredTheme() {}
