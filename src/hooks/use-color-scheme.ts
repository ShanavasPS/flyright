import { useColorScheme as useSystemColorScheme } from 'react-native';

/** The device's colour scheme, always one of the two the app has themes for.
 * React Native reports `null` when the platform states no preference (it said
 * `'unspecified'` before 0.88); either way the app paints light. The web twin
 * resolves to the same pair, so callers never branch on a third value. */
export function useColorScheme(): 'light' | 'dark' {
  return useSystemColorScheme() ?? 'light';
}
