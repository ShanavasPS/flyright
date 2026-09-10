import type { SessionRecord } from '@/services/session-expiry';

// Web signs in and out through Clerk's own UserButton; a session that runs
// out there behaves like any website, so nothing is remembered or shown.
export interface SignedOutNotice {
  email: string | null;
  at: string;
}

export function rememberSession(_record: SessionRecord): void {}

export function noteSignedOut(_now?: number): boolean {
  return false;
}

export function signedOutNotice(): SignedOutNotice | null {
  return null;
}

export function clearSignedOutNotice(): void {}

export function addSignedOutNoticeListener(_onChange: () => void): () => void {
  return () => {};
}
