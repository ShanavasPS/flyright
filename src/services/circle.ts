/** Pure helpers for circles (People tab) — no RN or SDK imports, so the
 * unit tests stay cheap. The share-sheet call lives in circle-share.ts. */

export const INVITE_URL = (token: string) => `https://getflyright.com/i/${token}`;

/** The invite token inside whatever the traveller pasted: the shared
 * https://getflyright.com/i/<token>, the app's own flyright://i/<token>, or
 * the Detour redirect that carries the same path one segment further in.
 * Strict on purpose — a looser match would send someone to a dead invite
 * page on the strength of an unrelated clipboard. */
export function inviteTokenFrom(text: string): string | null {
  return /\/i\/([A-Za-z0-9_-]{8,64})(?:[?#\s]|$)/.exec((text ?? '').trim())?.[1] ?? null;
}

/** "Anna, Sam & 2 more" — who follows a trip, first names only, for the
 * journey detail's watchers card. Profiles without a name read as "Someone". */
export function watcherNames(watchers: { name: string | null }[]): string {
  const names = watchers.map((w) => (w.name ?? 'Someone').trim().split(/\s+/)[0] || 'Someone');
  if (names.length <= 2) return names.join(' & ');
  if (names.length === 3) return `${names[0]}, ${names[1]} & ${names[2]}`;
  return `${names[0]}, ${names[1]} & ${names.length - 2} more`;
}

/** Server pushes carry absolute getflyright.com links (they double as web
 * links); the router wants the in-app path. */
export function toInAppPath(url: string): string {
  const path = url.replace(/^https?:\/\/(www\.)?getflyright\.com/i, '');
  return path.startsWith('/') ? path : `/${path}`;
}
