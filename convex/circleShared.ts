/** Circle limits shared by the Convex functions and the app (imported by
 * relative path, like liveShared). */

/** Legacy response code understood by older clients. Following has no
 * subscription cap; independent invitation and search abuse limits remain. */
export const CIRCLE_FULL = 'circle_full';

/** How "add someone" compares a typed query with a stored profile: trimmed,
 * lowercased, whitespace collapsed. Shared so the writer (users.ts) and the
 * reader (circle.findPeople) can never disagree about what matches. */
export function searchKey(value: string | null | undefined): string | null {
  const key = (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return key || null;
}

/** The first word of a searchable name — what a friend actually types.
 * Sign-in providers often put the whole name into the first-name field
 * ("Tamanna Irshad"), and a whole-name match then needs the surname too.
 * Still a WHOLE word, not a prefix: the no-directory rule stands. */
export function firstNameKey(value: string | null | undefined): string | null {
  const key = searchKey(value);
  return key ? key.split(' ')[0] : null;
}

/** Pending invitations one account may have out at a time — a cap on how
 * much push a stranger can generate, well above what anyone's circle needs. */
export const MAX_PENDING_REQUESTS = 20;

/** "Add someone" searches one account may run per UTC day, and the
 * ConvexError data thrown past it. An exact-address search answers whether
 * that address has an account; the ceiling is what keeps that from being
 * asked about a list. Typing a family's names costs a few dozen. */
export const MAX_SEARCHES_PER_DAY = 200;
export const SEARCH_LIMIT = 'search_limit';
