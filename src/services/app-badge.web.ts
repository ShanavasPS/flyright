import { attentionBadge, type AttentionCounts } from './attention';

/** The Badging API: installed PWAs get a count on their icon, tabs get
 * nothing — and a browser without it gets nothing either. */
export async function setAppBadge(counts: AttentionCounts): Promise<void> {
  const count = attentionBadge(counts);
  if (count === null) return;
  const nav = globalThis.navigator as Navigator & {
    setAppBadge?: (n: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) await nav.setAppBadge?.(count);
    else await nav.clearAppBadge?.();
  } catch {
    // Unsupported or blocked — a badge is a nicety.
  }
}

export async function appBadgePermission(): Promise<boolean> { return false; }
