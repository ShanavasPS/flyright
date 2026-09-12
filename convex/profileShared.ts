/** Only Clerk's image service may supply a remote profile image. */
export function safeAvatar(value: string | null): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && ['img.clerk.com', 'images.clerk.dev'].includes(url.hostname) ? value : null;
  } catch { return null; }
}
