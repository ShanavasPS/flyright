/**
 * Telling a forced sign-out apart from a chosen one.
 *
 * Clerk ends every session at its maximum lifetime (a year, since 2026-09-10;
 * seven days before that), and the app has no hook into the sign-out button
 * itself — it sits inside Clerk's native profile view. So the app remembers
 * the session it last saw, expiry date included, and when it next finds
 * itself signed out it asks: had that session run out? If so the traveller
 * did nothing and deserves a word about it; if not, they signed out
 * themselves (or deleted the account) and already know.
 */

/** What the app remembers about the signed-in session while it lasts. */
export interface SessionRecord {
  id: string;
  email: string | null;
  /** Clerk's `session.expireAt`, epoch ms. */
  expireAt: number;
}

/** Clerk can end a session slightly ahead of its stamped expiry (the last
 * token refresh fails a little early); a sign-out inside this window before
 * the deadline still counts as the session running out. */
export const EXPIRY_GRACE_MS = 5 * 60_000;

/**
 * Why the remembered session is gone: `expired` when its lifetime ran out
 * (show the notice), `deliberate` when it still had time left (the user
 * signed out, deleted the account, or a device revoked it — no notice).
 */
export function classifySignOut(record: SessionRecord, now: number): 'expired' | 'deliberate' {
  return record.expireAt - now <= EXPIRY_GRACE_MS ? 'expired' : 'deliberate';
}
