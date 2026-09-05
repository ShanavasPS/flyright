import Storage from 'expo-sqlite/kv-store';

/** "Sign in to follow" has to mean follow. The tap that opens the sign-in
 * sheet records which invite the traveller was answering, so the invite
 * redeems itself the moment an account exists — the redemption no longer
 * depends on them finding, and tapping, a second button on a screen that
 * looks exactly like the one they just left. (Every invite sent on
 * 2026-09-05 died on that second tap: the accounts were created, the invite
 * page re-rendered signed in, and circle.accept was never called once.)
 *
 * Stored rather than passed through the navigation params: the sign-in sheet
 * can come back to a re-created screen — or, after an OAuth round trip, to a
 * relaunched app — and an intent that survives that survives everything. */

const KEY = 'pending-follow';

/** How long the intent stays live. Long enough for an OAuth detour, a lost
 * network or a "finish this later", short enough that a link opened again
 * next week asks first. */
const TTL_MS = 3_600_000;

export function markPendingFollow(token: string): void {
  Storage.setItemSync(KEY, JSON.stringify({ token, at: Date.now() }));
}

/** Whether this invite is the one the traveller asked to follow. Reading
 * doesn't consume it: a follow that fails (offline, auth still settling)
 * must still be there for the retry. */
export function pendingFollowFor(token: string): boolean {
  const raw = Storage.getItemSync(KEY);
  if (!raw) return false;
  try {
    const { token: pending, at } = JSON.parse(raw) as { token?: string; at?: number };
    if (typeof at !== 'number' || Date.now() - at > TTL_MS) {
      clearPendingFollow();
      return false;
    }
    return pending === token;
  } catch {
    clearPendingFollow();
    return false;
  }
}

export function clearPendingFollow(): void {
  Storage.removeItemSync(KEY);
}
