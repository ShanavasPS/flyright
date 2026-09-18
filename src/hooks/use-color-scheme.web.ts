import { useSyncExternalStore } from 'react';

import { resolvedScheme, subscribeTheme } from '@/services/theme';

/** The web colour scheme: the stored preference (light unless the visitor
 * chose otherwise — see services/theme.web), resolved against the OS when it
 * says 'system'. The server snapshot is light, so static markup and the first
 * client render agree; a stored dark choice applies right after hydration. */
export function useColorScheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribeTheme, resolvedScheme, () => 'light');
}
