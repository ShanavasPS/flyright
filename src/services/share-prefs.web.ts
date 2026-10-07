import type { PosterTheme } from '@/services/world-share';

export interface SharePrefs {
  theme: PosterTheme;
}

/** Web has no share screen; the defaults keep the types honest. */
export function getSharePrefs(): SharePrefs {
  return { theme: 'dark' };
}

export function setSharePrefs(_prefs: SharePrefs) {}
