import Storage from 'expo-sqlite/kv-store';

import type { PosterTheme } from '@/services/world-share';

/** What the traveller last chose on the share screen — the poster's theme
 * and whether the heat layer is on. Remembered so a second share is one tap. */
export interface SharePrefs {
  theme: PosterTheme;
  heat: boolean;
}

const THEME_KEY = 'share-poster-theme';
const HEAT_KEY = 'share-poster-heat';

export function getSharePrefs(): SharePrefs {
  const theme = Storage.getItemSync(THEME_KEY);
  return {
    theme: theme === 'light' ? 'light' : 'dark',
    heat: Storage.getItemSync(HEAT_KEY) !== 'off',
  };
}

export function setSharePrefs(prefs: SharePrefs) {
  Storage.setItemSync(THEME_KEY, prefs.theme);
  Storage.setItemSync(HEAT_KEY, prefs.heat ? 'on' : 'off');
}
