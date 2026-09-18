import type { PosterTheme } from '@/services/world-share';

export interface SharePrefs {
  theme: PosterTheme;
  heat: boolean;
}

/** Web has no share screen; the defaults keep the types honest. */
export function getSharePrefs(): SharePrefs {
  return { theme: 'dark', heat: true };
}

export function setSharePrefs(_prefs: SharePrefs) {}
