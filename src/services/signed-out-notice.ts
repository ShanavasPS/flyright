import Storage from 'expo-sqlite/kv-store';

import { classifySignOut, type SessionRecord } from '@/services/session-expiry';

/** The remembered signed-in session (see session-expiry.ts). */
const SESSION_KEY = 'session-record';
/** Set when that session ran out; cleared on dismiss or the next sign-in. */
const NOTICE_KEY = 'signed-out-notice';

/** "You were signed out" — shown on My travels and the Settings account card
 * until the traveller dismisses it or signs back in. */
export interface SignedOutNotice {
  /** The account that was signed out, when Clerk knew its email. */
  email: string | null;
  /** When the app noticed, ISO. */
  at: string;
}

// The parsed notice is cached so useSyncExternalStore gets a stable snapshot;
// every write below invalidates it and tells the listeners.
let cached: SignedOutNotice | null | undefined;
const listeners = new Set<() => void>();

function emit() {
  cached = undefined;
  for (const listener of listeners) listener();
}

/** While signed in: keep the current session's identity and expiry on disk. */
export function rememberSession(record: SessionRecord): void {
  Storage.setItemSync(SESSION_KEY, JSON.stringify(record));
}

/** The app is signed out. Decide whether the last remembered session ran
 * out — and if it did, raise the notice. Returns true when it did. Idempotent:
 * the record is consumed either way, so a later call finds nothing. */
export function noteSignedOut(now = Date.now()): boolean {
  const raw = Storage.getItemSync(SESSION_KEY);
  if (raw == null) return false;
  Storage.removeItemSync(SESSION_KEY);
  let record: SessionRecord;
  try {
    record = JSON.parse(raw) as SessionRecord;
  } catch {
    return false;
  }
  if (typeof record.expireAt !== 'number' || classifySignOut(record, now) !== 'expired') {
    return false;
  }
  const notice: SignedOutNotice = { email: record.email ?? null, at: new Date(now).toISOString() };
  Storage.setItemSync(NOTICE_KEY, JSON.stringify(notice));
  emit();
  return true;
}

/** The pending notice, or null. Dev builds can force one with
 * EXPO_PUBLIC_PRETEND_SIGNED_OUT=1 in the shell that starts Metro. */
export function signedOutNotice(): SignedOutNotice | null {
  if (cached !== undefined) return cached;
  if (__DEV__ && process.env.EXPO_PUBLIC_PRETEND_SIGNED_OUT) {
    cached = { email: 'you@example.com', at: new Date().toISOString() };
    return cached;
  }
  const raw = Storage.getItemSync(NOTICE_KEY);
  if (raw == null) {
    cached = null;
    return cached;
  }
  try {
    cached = JSON.parse(raw) as SignedOutNotice;
  } catch {
    Storage.removeItemSync(NOTICE_KEY);
    cached = null;
  }
  return cached;
}

/** The traveller dismissed the notice, or signed back in. */
export function clearSignedOutNotice(): void {
  if (Storage.getItemSync(NOTICE_KEY) == null) return;
  Storage.removeItemSync(NOTICE_KEY);
  emit();
}

/** Re-render surfaces showing the notice when it appears or goes. */
export function addSignedOutNoticeListener(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
