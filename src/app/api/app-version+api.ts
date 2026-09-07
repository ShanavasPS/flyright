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
 * on what is live — the App Store via the public lookup API, Google Play via
 * the publisher API with the submit service account — because a release
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

/** The version the App Store lists — Apple's public lookup, no auth. */
async function appStoreLatest(): Promise<LatestRelease | null> {
  const res = await fetch(`https://itunes.apple.com/lookup?id=${APP_STORE_ID}`, {
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`App Store lookup ${res.status}`);
  const data = (await res.json()) as {
    results?: { version?: string; currentVersionReleaseDate?: string }[];
  };
  const app = data.results?.[0];
  if (!app?.version || !isVersion(app.version)) return null;
  return { version: app.version, releasedAt: app.currentVersionReleaseDate ?? null };
}

/** The newest release rolling on Play's production track. Reading tracks
 * goes through an "edit" like writing does; it is deleted straight after so
 * nothing half-open is left for the next `eas submit`. Needs the submit
 * service account as GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (sensitive, not
 * secret — secret variables never reach the Hosting runtime). */
async function playLatest(): Promise<LatestRelease | null> {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const account = JSON.parse(raw) as { client_email: string; private_key: string };
  const token = await googleAccessToken(account, 'https://www.googleapis.com/auth/androidpublisher');
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_PACKAGE}/edits`;
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const signal = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);

  const edit = (await (await fetch(base, { method: 'POST', headers, body: '{}', signal })).json()) as {
    id?: string;
  };
  if (!edit.id) return null;
  try {
    const track = (await (
      await fetch(`${base}/${edit.id}/tracks/production`, { headers, signal })
    ).json()) as { releases?: { status?: string; name?: string }[] };
    let best: string | null = null;
    for (const release of track.releases ?? []) {
      // A staged rollout counts: the store offers it to whoever it reaches.
      const live = release.status === 'completed' || release.status === 'inProgress';
      if (live && release.name && isVersion(release.name)) {
        if (!best || compareVersions(release.name, best) > 0) best = release.name;
      }
    }
    return best ? { version: best, releasedAt: null } : null;
  } finally {
    await fetch(`${base}/${edit.id}`, { method: 'DELETE', headers, signal }).catch(() => {});
  }
}

/** Service-account OAuth: a self-signed RS256 JWT swapped for a bearer token.
 * WebCrypto, so it runs the same on the Hosting worker and in Node dev. */
async function googleAccessToken(
  account: { client_email: string; private_key: string },
  scope: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: account.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64url(new Uint8Array(signature))}`,
    }),
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Google token exchange failed');
  return data.access_token;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const binary = atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
