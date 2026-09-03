/** Pure helpers for deferred deep links (Detour) — no RN or SDK imports, so
 * the unit tests stay cheap. The provider lives in
 * components/deferred-link-router.tsx. */

import { STORE_URLS } from '@/constants/store-links';

/** The only in-app paths a deferred link may open: trip share pages and
 * circle invites. Anything else the match API hands back is dropped — the
 * destination is server-provided, so it never gets to pick a screen. */
const DEFERRABLE = /^\/(i|t)\/[A-Za-z0-9_-]+$/;

export function deferrablePath(route: string): string | null {
  const path = route.split('?')[0] ?? '';
  return DEFERRABLE.test(path) ? path : null;
}

export type StorePlatform = keyof typeof STORE_URLS;

/** Where a web landing's store button sends the visitor. On the matching
 * phone the click goes through Detour — it records the device, redirects to
 * the store, and the app receives `path` on first launch. Anywhere else
 * (desktop, the other platform's button, no Detour configured) the plain
 * listing, since a click Detour can't match to the installing device only
 * costs a redirect. */
export function storeLink(
  platform: StorePlatform,
  path: string,
  { base, userAgent }: { base: string; userAgent: string },
): string {
  const onPlatform =
    platform === 'ios' ? /iPhone|iPad|iPod/i.test(userAgent) : /Android/i.test(userAgent);
  if (!base || !onPlatform || !deferrablePath(path)) return STORE_URLS[platform];
  return `${base.replace(/\/+$/, '')}${path}`;
}
