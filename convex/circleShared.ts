/** Circle limits shared by the Convex functions and the app (imported by
 * relative path, like liveShared). */

/** People who may follow a free account's trips. Pro lifts the cap — "your
 * whole family follows every trip automatically" is the recurring reason to
 * stay subscribed between (rare) claims. */
export const FREE_CIRCLE_SIZE = 1;

/** ConvexError data thrown by circle.createInvite / accept / shareBack when
 * the owner is at the free cap. Plain Error messages are redacted in
 * production, so the client matches on this instead. */
export const CIRCLE_FULL = 'circle_full';

/** How "add someone" compares a typed query with a stored profile: trimmed,
 * lowercased, whitespace collapsed. Shared so the writer (users.ts) and the
 * reader (circle.findPeople) can never disagree about what matches. */
export function searchKey(value: string | null | undefined): string | null {
  const key = (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return key || null;
}

/** Pending invitations one account may have out at a time — a cap on how
 * much push a stranger can generate, well above what anyone's circle needs. */
export const MAX_PENDING_REQUESTS = 20;
