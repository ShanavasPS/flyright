import Storage from 'expo-sqlite/kv-store';

import type { PosterTheme } from '@/services/world-share';

/** What the traveller last chose on the share screen — the poster's theme.
 * Remembered so a second share is one tap. The heat layer is not: it starts
 * off on every visit (the screen keeps it in local state). */
export interface SharePrefs {
  theme: PosterTheme;
}

const THEME_KEY = 'share-poster-theme';

export function getSharePrefs(): SharePrefs {
  const theme = Storage.getItemSync(THEME_KEY);
  return { theme: theme === 'light' ? 'light' : 'dark' };
}

export function setSharePrefs(prefs: SharePrefs) {
  Storage.setItemSync(THEME_KEY, prefs.theme);
}
