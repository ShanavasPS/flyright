/** Clerk's image hosts, where every real profile photo lives, plus Unsplash for the
 * stock portraits of seeded demo people (devTools.seedDemoCircle). */
const AVATAR_HOSTS = ['img.clerk.com', 'images.clerk.dev', 'images.unsplash.com'];

export function safeAvatar(value: string | null): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && AVATAR_HOSTS.includes(url.hostname) ? value : null;
  } catch { return null; }
}
