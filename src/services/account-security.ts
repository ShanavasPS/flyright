/** Wording for the Account & security screen (screens/account): which
 * device a Clerk session is on, where, and how long ago it was used. The
 * session's activity is all Clerk knows — the app's own requests carry no
 * browser, so the iPhone app reports itself as "FlyRight" (its build as the
 * version) and the Android app as its HTTP client, OkHttp. */

import { COUNTRY_NAMES } from '@/constants/countries';

export type SessionActivity = {
  browserName?: string | null;
  browserVersion?: string | null;
  deviceType?: string | null;
  isMobile?: boolean | null;
  city?: string | null;
  country?: string | null;
};

export type DeviceKind = 'iphone' | 'android' | 'phone' | 'computer';

export function deviceKind(activity: SessionActivity | null | undefined): DeviceKind {
  const browser = activity?.browserName?.toLowerCase() ?? '';
  if (browser === 'flyright') return 'iphone';
  if (browser === 'okhttp') return 'android';
  return activity?.isMobile ? 'phone' : 'computer';
}

/** "iPhone app", "Android app", "Safari on a phone", "Chrome on a computer". */
export function deviceLabel(activity: SessionActivity | null | undefined): string {
  const kind = deviceKind(activity);
  if (kind === 'iphone') return 'iPhone app';
  if (kind === 'android') return 'Android app';
  const browser = activity?.browserName?.trim() || 'A browser';
  return `${browser} on a ${kind}`;
}

/** Clerk gives the country as a name or, sometimes, a two-letter code.
 * The bundled table, since Hermes has no Intl.DisplayNames. */
function countryOf(country: string): string {
  return /^[A-Z]{2}$/.test(country) ? (COUNTRY_NAMES[country] ?? country) : country;
}

/** "Helsinki, Finland", or whichever half is known. */
export function placeLabel(activity: SessionActivity | null | undefined): string | null {
  const city = activity?.city?.trim();
  const country = activity?.country?.trim();
  const parts = [city, country ? countryOf(country) : null].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** "Active now", "Active 5 min ago", "Active 3 h ago", "Active 2 days ago". */
export function activeLabel(lastActive: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - lastActive.getTime()) / 60_000);
  if (minutes < 2) return 'Active now';
  if (minutes < 60) return `Active ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Active ${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Active yesterday';
  if (days < 60) return `Active ${days} days ago`;
  return `Active ${Math.floor(days / 30)} months ago`;
}

/** The other devices, most recently used first. */
export function otherSessions<T extends { id: string; lastActiveAt: Date }>(sessions: T[], currentId: string | null): T[] {
  return sessions
    .filter((s) => s.id !== currentId)
    .sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());
}

/** What the person typed is an email address worth sending a code to. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
