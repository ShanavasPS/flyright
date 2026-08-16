/**
 * GET /api/app-version?platform=ios|android&version=1.0.0
 *
 * Force-update gate. Returns whether the given binary version is still
 * allowed, plus the store URL to send the user to when it isn't. The minimum
 * lives server-side (env-overridable) so raising it is an `eas deploy` of the
 * web bundle — no app release. The client fails open on any error, so this
 * endpoint must only return valid=false for versions that truly cannot be
 * allowed to run.
 */
const MIN_SUPPORTED_VERSION = process.env.MIN_SUPPORTED_APP_VERSION ?? '1.0.0';

const STORE_URLS: Record<string, string> = {
  ios: 'https://apps.apple.com/app/id6801505051',
  android: 'https://play.google.com/store/apps/details?id=com.shanavasshaji.flyright',
};

/** Compare dotted numeric versions; negative when a < b. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const platform = url.searchParams.get('platform') ?? '';
  const version = url.searchParams.get('version') ?? '';

  // Malformed input (or a platform we don't gate, like web) → valid: the
  // client treats anything but an explicit "no" as permission to run.
  if (!/^\d+(\.\d+)*$/.test(version) || !(platform in STORE_URLS)) {
    return Response.json({ valid: true, minVersion: MIN_SUPPORTED_VERSION });
  }

  const valid = compareVersions(version, MIN_SUPPORTED_VERSION) >= 0;
  return Response.json({
    valid,
    minVersion: MIN_SUPPORTED_VERSION,
    storeUrl: STORE_URLS[platform],
  });
}
