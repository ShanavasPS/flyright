import { desc, eq, isNull, or } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { claims, journeys } from '@/db/schema';
import type { Verdict } from '@/rules/types';
import { canTransition, type ClaimStatus, type SentSnapshot } from '@/services/claim-status';
import { reconcileNotifications } from '@/services/notification-lifecycle';

export type ClaimRow = typeof claims.$inferSelect;

/** The letter gives the carrier 6 weeks to respond before escalation. */
export const RESPONSE_WINDOW_DAYS = 42;

/** One claim per journey — deterministic id so re-running the wizard updates
 * the same row instead of stacking duplicates. */
const claimId = (journeyId: string) => `claim-${journeyId}`;

/** Same viewer scoping as journeys: own rows plus unclaimed anonymous ones. */
function visibleTo(currentUserId: string | null | undefined) {
  return currentUserId
    ? or(isNull(claims.userId), eq(claims.userId, currentUserId))
    : isNull(claims.userId);
}

export type ClaimWithJourney = { claims: ClaimRow; journeys: typeof journeys.$inferSelect };

/** The viewer's claims with their journeys, newest first. Live. The journey
 * join is deliberately blind to soft-deletes — removing a trip from the
 * journal shouldn't lose track of money the carrier still owes. */
export function useClaims(currentUserId: string | null | undefined) {
  return useLiveQuery(
    db
      .select()
      .from(claims)
      .innerJoin(journeys, eq(claims.journeyId, journeys.id))
      .where(visibleTo(currentUserId))
      .orderBy(desc(claims.createdAt)),
    [currentUserId ?? ''],
  );
}

/** The journey's claim, or undefined while loading / when none exists. */
export function useClaimForJourney(journeyId: string): ClaimRow | undefined {
  const { data } = useLiveQuery(
    db.select().from(claims).where(eq(claims.journeyId, journeyId)),
    [journeyId],
  );
  return data?.[0];
}

/**
 * Record the wizard's outcome. Status only moves forward: a later wizard run
 * that ends in a cancelled composer must not demote an already-sent claim
 * back to draft.
 */
export async function saveClaim(opts: {
  journeyId: string;
  userId: string | null | undefined;
  verdict: Verdict;
  sent: boolean;
  /** Frozen copy of what went out — stored only on the sending run. */
  snapshot?: SentSnapshot | null;
}): Promise<void> {
  const { journeyId, userId, verdict, sent, snapshot } = opts;
  if (!verdict.compensation) return;

  const now = new Date();
  const deadline = new Date(now.getTime() + RESPONSE_WINDOW_DAYS * 86_400_000);
  const id = claimId(journeyId);

  const [existing] = await db.select().from(claims).where(eq(claims.id, id));
  if (existing) {
    if (existing.status !== 'draft' || !sent) return;
    await db
      .update(claims)
      .set({
        status: 'sent',
        sentAt: now.toISOString(),
        responseDeadline: deadline.toISOString(),
        sentSnapshot: snapshot ? JSON.stringify(snapshot) : null,
      })
      .where(eq(claims.id, id));
    void reconcileNotifications();
    return;
  }

  await db.insert(claims).values({
    id,
    userId: userId ?? null,
    journeyId,
    regulation: verdict.regulation ?? '',
    amount: verdict.compensation.amount,
    currency: verdict.compensation.currency,
    status: sent ? 'sent' : 'draft',
    sentAt: sent ? now.toISOString() : null,
    responseDeadline: sent ? deadline.toISOString() : null,
    sentSnapshot: sent && snapshot ? JSON.stringify(snapshot) : null,
    createdAt: now.toISOString(),
  });
  void reconcileNotifications();
}

/** Record the airline's (or enforcement body's) response. Illegal jumps are
 * ignored rather than thrown — a stale menu tap after a live-query update
 * shouldn't crash the screen. Deadline reminders key off status === 'sent',
 * so the reconcile clears them the moment an outcome lands. */
export async function recordOutcome(id: string, next: ClaimStatus): Promise<void> {
  const [existing] = await db.select().from(claims).where(eq(claims.id, id));
  if (!existing || !canTransition(existing.status, next)) return;
  await db.update(claims).set({ status: next }).where(eq(claims.id, id));
  void reconcileNotifications();
}
