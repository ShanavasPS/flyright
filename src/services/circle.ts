/** Pure helpers for circles (People tab) — no RN or SDK imports, so the
 * unit tests stay cheap. The share-sheet call lives in circle-share.ts. */

export const INVITE_URL = (token: string) => `https://getflyright.com/i/${token}`;

/** "Anna following" / "Anna & Ben following" / "Anna +2 following" — the
 * Find My cue that someone is watching, by name. */
export function followingLabel(followers: { name: string | null }[]): string {
  const names = followers.map((f) => f.name ?? 'Someone');
  if (names.length === 0) return 'Share live';
  if (names.length === 1) return `${names[0]} following`;
  if (names.length === 2) return `${names[0]} & ${names[1]} following`;
  return `${names[0]} +${names.length - 1} following`;
}

/** Server pushes carry absolute getflyright.com links (they double as web
 * links); the router wants the in-app path. */
export function toInAppPath(url: string): string {
  const path = url.replace(/^https?:\/\/(www\.)?getflyright\.com/i, '');
  return path.startsWith('/') ? path : `/${path}`;
}
