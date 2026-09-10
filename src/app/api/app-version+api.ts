/**
 * GET /api/app-version?platform=ios|android&version=1.0.0
 *
 * Two answers in one call.
 *
 * The force-update gate: whether the given binary version is still allowed,
 * plus the store URL to send the user to when it isn't. The minimum lives
 * server-side (env-overridable) so raising it is an `eas deploy` of the web
 * bundle — no app release. The client fails open on any error, so this
 * endpoint must only return valid=false for versions that truly cannot be
 * allowed to run.
 *
 * The update notice: the version the store is serving right now and the
 * release notes between the caller's version and it, so Settings can say
 * "1.0.25 is out, here is what you are missing". The store is the authority
 * on what is live — both read from the public store pages — because a release
 * sits in review for days and announcing it early would send people to a
 * store page that still offers what they have. Lookups are cached in the
 * isolate for a while and fail soft: no answer means no notice, never a
 * wrong one.
 */
import { RELEASE_NOTES } from '@/constants/release-notes';
import { STORE_URLS } from '@/constants/store-links';
import {
  compareVersions,
  isVersion,
  notesBetween,
  type AppVersionResponse,
  type LatestRelease,
} from '@/services/app-version';

const MIN_SUPPORTED_VERSION = process.env.MIN_SUPPORTED_APP_VERSION ?? '1.0.0';
const APP_STORE_ID = '6801505051';
const ANDROID_PACKAGE = 'com.shanavasshaji.flyright';
/** How long a store answer is trusted; a failed lookup retries after RETRY_MS. */
const LOOKUP_TTL_MS = 15 * 60_000;
const RETRY_MS = 60_000;
/** The gate must answer fast — a slow store must not hold the app's launch. */
const LOOKUP_TIMEOUT_MS = 4_000;

type Platform = keyof typeof STORE_URLS;

const latestCache: Partial<Record<Platform, { until: number; latest: LatestRelease | null }>> = {};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const platform = url.searchParams.get('platform') ?? '';
  const version = url.searchParams.get('version') ?? '';

  // Malformed input (or a platform we don't gate, like web) → valid: the
  // client treats anything but an explicit "no" as permission to run.
  if (!isVersion(version) || !(platform in STORE_URLS)) {
    return Response.json({ valid: true, minVersion: MIN_SUPPORTED_VERSION });
  }

  const valid = compareVersions(version, MIN_SUPPORTED_VERSION) >= 0;
  const latest = await latestFor(platform as Platform);
  const body: AppVersionResponse = {
    valid,
    minVersion: MIN_SUPPORTED_VERSION,
    storeUrl: STORE_URLS[platform as Platform],
    latest,
    notes: latest ? notesBetween(RELEASE_NOTES, version, latest.version) : [],
  };
  // EAS Hosting caches by URL; ten minutes keeps a launch wave off the stores.
  return Response.json(body, { headers: { 'cache-control': 'public, max-age=600' } });
}

async function latestFor(platform: Platform): Promise<LatestRelease | null> {
  const hit = latestCache[platform];
  if (hit && Date.now() < hit.until) return hit.latest;
  let latest: LatestRelease | null = null;
  try {
    latest = platform === 'ios' ? await appStoreLatest() : await playLatest();
  } catch {
    latest = null;
  }
  latestCache[platform] = { until: Date.now() + (latest ? LOOKUP_TTL_MS : RETRY_MS), latest };
  return latest;
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';

/** The version the App Store lists on the app's public page.
 *
 * Not the iTunes lookup API: its origin answers 403 to Cloudflare's network,
 * so from Hosting it only ever worked while Akamai held a cached copy — and
 * that copy lives ten hours, which is how long a new release stayed
 * unannounced. The store page comes straight from origin and embeds the
 * "What's New" shelf as `"primarySubtitle":"Version 1.0.29","secondarySubtitle":
 * "<release date>"` (the version-history rows carry the bare number the same
 * way); the newest version wins and its date rides along. */
async function appStoreLatest(): Promise<LatestRelease | null> {
  const res = await fetch(`https://apps.apple.com/us/app/id${APP_STORE_ID}`, {
    headers: { 'user-agent': BROWSER_UA, accept: 'text/html', 'accept-language': 'en' },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`App Store page ${res.status}`);
  const html = await res.text();
  let best: LatestRelease | null = null;
  const shelf =
    /"primarySubtitle":"(?:Version )?(\d+(?:\.\d+)+)","secondarySubtitle":"([^"]*)"/g;
  for (const match of html.matchAll(shelf)) {
    const version = match[1];
    if (!isVersion(version) || (best && compareVersions(version, best.version) <= 0)) continue;
    const at = Date.parse(match[2]);
    best = { version, releasedAt: Number.isNaN(at) ? null : new Date(at).toISOString() };
  }
  return best;
}

/** The version Google Play lists on the app's store page.
 *
 * Not the publisher API: reading tracks there means opening an "edit", and
 * Play allows ONE open edit per app — every edit this route opened, even a
 * read-only one it deleted a second later, would kill an `eas submit`
 * upload in flight ("This edit has expired"). The public page carries the
 * version in its data blob as `[[["1.0.25"]]`; the newest such value wins,
 * and anything that does not parse as a version is ignored. */
async function playLatest(): Promise<LatestRelease | null> {
  const res = await fetch(
    `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}&hl=en&gl=US`,
    {
      headers: { 'user-agent': BROWSER_UA, accept: 'text/html' },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`Play page ${res.status}`);
  const html = await res.text();
  let best: string | null = null;
  for (const match of html.matchAll(/\[\[\["(\d+(?:\.\d+)+)"\]\]/g)) {
    const version = match[1];
    if (isVersion(version) && (!best || compareVersions(version, best) > 0)) best = version;
  }
  return best ? { version: best, releasedAt: null } : null;
}
