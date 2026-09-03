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
