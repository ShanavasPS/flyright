/** Who may spend a live flight lookup, and whether there is anything left to
 * spend — for them, and for us.
 *
 * The flight-status route proxies a metered provider, so it is gated in two
 * separable halves:
 *
 *  1. Identity (`identifyCaller`). A `Bearer` Clerk session token identifies
 *     an account; the token is verified here against the Clerk instance's
 *     JWKS (RS256, via WebCrypto — the route runs on Cloudflare Workers and
 *     in the Expo dev server, both of which have it). No token: only the web
 *     compensation checker may proceed, recognised by its Origin/Referer, and
 *     it is budgeted per address. The native app signed out gets 401 and
 *     offers sign-in instead. This half is local and free.
 *  2. Spending (`beginLookup`). One Convex round trip that answers three
 *     questions at once — is this answer already cached, is there monthly
 *     provider pool left, and does this caller have daily allowance — because
 *     Workers pay a network hop for each question asked separately. See
 *     convex/provider.ts. Pro accounts get the larger daily limit, read
 *     server-side from the entitlements mirror.
 *
 * Infra hiccups fail open: a metering outage must not take lookups down;
 * bots are the concern, not the counter.
 *
 * Server-only: never import from app code. */

import { ConvexHttpClient } from 'convex/browser';

import { api } from '../../convex/_generated/api';
import { lookupDay } from '../../convex/lookupShared';
import type { BeginResult } from '../../convex/provider';
import type { Degradation } from '../../convex/providerShared';

export type GateSubject = { kind: 'user'; userId: string } | { kind: 'anonymous'; address: string };

export type GateResult =
  | { ok: true; subject: GateSubject }
  | { ok: false; status: 401 | 429 | 500; error: string };

/** Sites whose visitors may look a flight up without an account (the
 * getflyright.com "check your flight" funnel), plus local web development. */
const WEB_ORIGINS = new Set([
  'https://getflyright.com',
  'https://www.getflyright.com',
  'https://flyright.expo.app',
]);

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export async function identifyCaller(request: Request): Promise<GateResult> {
  const token = bearerToken(request);
  let subject: GateSubject;

  // No issuer to verify against: production refuses (a misconfigured deploy
  // must not become an open proxy); development and tests run ungated,
  // metered under whatever identity the request claims.
  if (!issuerDomain()) {
    if (isProduction()) return { ok: false, status: 500, error: 'lookup_auth_not_configured' };
    subject = token
      ? { kind: 'user', userId: unverifiedSubject(token) ?? 'dev' }
      : { kind: 'anonymous', address: 'dev' };
  } else if (token) {
    const userId = await verifiedSubject(token);
    if (!userId) return { ok: false, status: 401, error: 'invalid_token' };
    subject = { kind: 'user', userId };
  } else if (isWebChecker(request)) {
    subject = { kind: 'anonymous', address: await hashed(clientAddress(request)) };
  } else {
    return { ok: false, status: 401, error: 'sign_in_required' };
  }

  return { ok: true, subject };
}

// -- identity -----------------------------------------------------------------

function issuerDomain(): string | null {
  return process.env.CLERK_JWT_ISSUER_DOMAIN?.replace(/\/$/, '') || null;
}

/** Route unit tests hand the handler a bare `{ url }`; treat that as headerless. */
function header(request: Request, name: string): string | null {
  return request.headers?.get?.(name) ?? null;
}

function bearerToken(request: Request): string | null {
  const value = header(request, 'authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? match[1] : null;
}

function refererOrigin(request: Request): string | null {
  const referer = header(request, 'referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function webOriginAllowed(origin: string): boolean {
  if (WEB_ORIGINS.has(origin)) return true;
  if (isProduction()) return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

/** Our own public compensation checker, the only caller allowed without an
 * account.
 *
 * The page's own marker decides first. It is not a credential — anyone can
 * copy it — but a *website* cannot make a visitor's browser send it: a
 * cross-site request carrying a custom header needs a CORS preflight, which
 * this route does not answer. What it does do is survive infrastructure:
 * EAS Hosting forwards an `Origin` and `Referer` of the host being requested,
 * so an origin-first rule refuses the checker on any host outside the list
 * (a preview deployment) while rubber-stamping every caller on the hosts
 * inside it. Server-side callers can send anything, and are held by the
 * per-address daily budget rather than by any header.
 *
 * Origin (or, failing that, Referer) is the fallback for a browser that
 * sends no marker: it has to name one of our sites. */
function isWebChecker(request: Request): boolean {
  if (header(request, 'x-flyright-web') === '1') return true;
  const origin = header(request, 'origin') ?? refererOrigin(request);
  return !!origin && webOriginAllowed(origin);
}

function clientAddress(request: Request): string {
  return (
    header(request, 'cf-connecting-ip') ??
    header(request, 'x-forwarded-for')?.split(',')[0].trim() ??
    header(request, 'x-real-ip') ??
    'unknown'
  );
}

/** Addresses are keyed by hash so the quota table never stores raw IPs. */
async function hashed(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

// -- Clerk session token ------------------------------------------------------

interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  n: string;
  e: string;
}

let jwksCache: { issuer: string; keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function jwks(issuer: string, forceRefresh = false): Promise<Jwk[]> {
  const fresh = jwksCache && jwksCache.issuer === issuer && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (fresh && !forceRefresh) return jwksCache!.keys;
  const response = await fetch(`${issuer}/.well-known/jwks.json`);
  if (!response.ok) throw new Error(`jwks ${response.status}`);
  const body = (await response.json()) as { keys?: Jwk[] };
  jwksCache = { issuer, keys: body.keys ?? [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

function base64UrlDecode(segment: string): Uint8Array<ArrayBuffer> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson<T>(segment: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment))) as T;
  } catch {
    return null;
  }
}

interface Claims {
  sub?: string;
  iss?: string;
  exp?: number;
  nbf?: number;
}

/** The token's `sub` when it is a valid, unexpired session token from our
 * Clerk instance; null when it isn't. */
async function verifiedSubject(token: string): Promise<string | null> {
  const issuer = issuerDomain();
  if (!issuer) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const header = decodeJson<{ alg?: string; kid?: string }>(parts[0]);
  const claims = decodeJson<Claims>(parts[1]);
  if (!header || !claims || header.alg !== 'RS256' || !header.kid) return null;

  const now = Math.floor(Date.now() / 1000);
  // A minute of leeway for clock skew between the phone and the edge.
  if (claims.iss !== issuer || !claims.sub) return null;
  if (typeof claims.exp !== 'number' || claims.exp < now - 60) return null;
  if (typeof claims.nbf === 'number' && claims.nbf > now + 60) return null;

  try {
    let keys = await jwks(issuer);
    let jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) {
      // Key rotation: refetch once before giving up.
      keys = await jwks(issuer, true);
      jwk = keys.find((k) => k.kid === header.kid);
    }
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      base64UrlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    return valid ? claims.sub : null;
  } catch (error) {
    console.warn('[lookup-gate] token verification failed', error);
    return null;
  }
}

/** Development only: the unverified `sub`, so a dev server without the
 * issuer configured still meters per account instead of refusing everyone. */
function unverifiedSubject(token: string): string | null {
  const parts = token.split('.');
  return parts.length === 3 ? (decodeJson<Claims>(parts[1])?.sub ?? null) : null;
}

// -- budget -------------------------------------------------------------------

let convexClient: ConvexHttpClient | null | undefined;

function convex(): ConvexHttpClient | null {
  if (convexClient !== undefined) return convexClient;
  const url = process.env.EXPO_PUBLIC_CONVEX_URL;
  convexClient = url ? new ConvexHttpClient(url) : null;
  return convexClient;
}

export interface LookupRequest {
  flight: string;
  date: string;
  /** Whether the answer must include the resolved inbound rotation. */
  want: 'base' | 'inbound';
  /** Units of the caller's daily allowance this costs on a cache miss. */
  cost: number;
}

/**
 * Cache, pool and daily allowance in one round trip. A `permit` also carries
 * the current degradation level, which tells the route whether the pool is
 * thin enough to skip the speculative inbound call.
 *
 * Fails open to a permit: if metering is unconfigured or Convex is
 * unreachable, a lookup is better than an outage. The provider's own monthly
 * ceiling is the backstop in that case.
 */
export async function beginLookup(
  subject: GateSubject,
  request: LookupRequest,
): Promise<BeginResult> {
  const secret = process.env.LOOKUP_QUOTA_SECRET;
  const client = convex();
  if (!secret || !client) {
    if (isProduction()) console.warn('[lookup-gate] lookup metering not configured');
    return { outcome: 'permit', level: 'full' };
  }
  try {
    return await client.mutation(api.provider.begin, {
      secret,
      day: lookupDay(new Date()),
      kind: 'interactive',
      subject,
      ...request,
    });
  } catch (error) {
    console.warn('[lookup-gate] metering unreachable, proceeding unmetered', error);
    return { outcome: 'permit', level: 'full' };
  }
}

/** File a fresh answer in the shared cache and charge the pool. Best-effort:
 * a failure here costs money on the next identical request but must never
 * fail the response the caller is waiting for. */
export async function recordLookup(args: {
  flight: string;
  date: string;
  want: 'base' | 'inbound';
  /** Present when the lookup failed for a reason of ours, so the caller gets
   * their daily allowance back rather than paying for our error. */
  refund?: { day: string; cost: number; subject: GateSubject } | null;
  /** null charges the pool without caching anything — a call that cost units
   * but produced no answer worth keeping (a 404, an upstream error). */
  payload: string | null;
  phase: string;
  expiresAt: number;
  units: number;
  reported: { remaining: number; limit: number } | null;
}): Promise<void> {
  const secret = process.env.LOOKUP_QUOTA_SECRET;
  const client = convex();
  if (!secret || !client) return;
  try {
    // `...args` must come first: it carries `refund` as possibly-undefined,
    // and the validator accepts an object or null, never undefined.
    await client.mutation(api.provider.record, {
      ...args,
      secret,
      refund: args.refund ?? null,
    });
  } catch (error) {
    console.warn('[lookup-gate] could not cache the answer', error);
  }
}

export type { BeginResult, Degradation };
