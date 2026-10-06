/** Lounge passes and logged lounge visits: the local `lounge_passes` and
 * `lounge_visits` tables (docs/lounges.md). Device-only, never synced, like
 * memberships: a pass number never leaves the phone, and followers never
 * see a visit. Rows belong to the account that added them (null while
 * anonymous). */

import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';

import { db } from '@/db/client';
import { loungePasses, loungeVisits } from '@/db/schema';
import { useLiveRows } from '@/services/live-rows';

export type LoungePassRow = typeof loungePasses.$inferSelect;
export type LoungeVisitRow = typeof loungeVisits.$inferSelect;

export type LoungePassInput = Pick<
  LoungePassRow,
  'network' | 'plan' | 'number' | 'freeVisits' | 'usedBefore' | 'renewsOn' | 'extraVisitCents' | 'guestCents' | 'currency'
>;

export type LoungeVisitInput = Pick<
  LoungeVisitRow,
  'journeyId' | 'loungeId' | 'loungeName' | 'airport' | 'way' | 'passId' | 'paidCents' | 'currency' | 'leaveBy'
>;

const passOwnedBy = (userId: string | null | undefined) =>
  userId ? or(isNull(loungePasses.userId), eq(loungePasses.userId, userId)) : isNull(loungePasses.userId);
const visitOwnedBy = (userId: string | null | undefined) =>
  userId ? or(isNull(loungeVisits.userId), eq(loungeVisits.userId, userId)) : isNull(loungeVisits.userId);

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The passes, in card order. Live; undefined until the first read. */
export function useLoungePasses(userId: string | null | undefined): LoungePassRow[] | undefined {
  const { data } = useLiveRows(
    db
      .select()
      .from(loungePasses)
      .where(and(passOwnedBy(userId), isNull(loungePasses.deletedAt)))
      .orderBy(asc(loungePasses.position), asc(loungePasses.createdAt)),
    [userId ?? null],
  );
  return data;
}

export function useLoungePass(id: string | undefined): LoungePassRow | undefined {
  const { data } = useLiveRows(
    db.select().from(loungePasses).where(and(eq(loungePasses.id, id ?? ''), isNull(loungePasses.deletedAt))),
    [id ?? ''],
  );
  return data?.[0];
}

/** Every visit not undone, newest first. Live. */
export function useLoungeVisits(userId: string | null | undefined): LoungeVisitRow[] | undefined {
  const { data } = useLiveRows(
    db
      .select()
      .from(loungeVisits)
      .where(and(visitOwnedBy(userId), isNull(loungeVisits.deletedAt)))
      .orderBy(desc(loungeVisits.enteredAt)),
    [userId ?? null],
  );
  return data;
}

export async function addLoungePass(userId: string | null | undefined, input: LoungePassInput): Promise<string> {
  const existing = await db
    .select({ position: loungePasses.position })
    .from(loungePasses)
    .where(and(passOwnedBy(userId), isNull(loungePasses.deletedAt)));
  const position = existing.reduce((max, r) => Math.max(max, r.position + 1), 0);
  const now = new Date().toISOString();
  const id = newId();
  await db.insert(loungePasses).values({
    id,
    userId: userId ?? null,
    ...input,
    position,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  return id;
}

export async function updateLoungePass(id: string, input: LoungePassInput): Promise<void> {
  await db
    .update(loungePasses)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(eq(loungePasses.id, id));
}

export async function deleteLoungePass(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.update(loungePasses).set({ deletedAt: now, updatedAt: now }).where(eq(loungePasses.id, id));
}

/** "I'm in the lounge": a visit from now. Resolves to its id. */
export async function logLoungeVisit(userId: string | null | undefined, input: LoungeVisitInput): Promise<string> {
  const now = new Date().toISOString();
  const id = newId();
  await db.insert(loungeVisits).values({
    id,
    userId: userId ?? null,
    ...input,
    guests: 0,
    enteredAt: now,
    leftAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  return id;
}

/** "I've left the lounge". */
export async function leaveLoungeVisit(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.update(loungeVisits).set({ leftAt: now, updatedAt: now }).where(eq(loungeVisits.id, id));
}

/** Undo: the visit never happened, so it gives the free visit back. */
export async function undoLoungeVisit(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.update(loungeVisits).set({ deletedAt: now, updatedAt: now }).where(eq(loungeVisits.id, id));
}

/** Whether a visit is still going: not left, and before its leave-by time
 * (a visit closes itself then — nobody taps "I've left" at the gate). A
 * delay moves the leave-by time: pass the current one as `until`. */
export function isOngoing(visit: Pick<LoungeVisitRow, 'leftAt' | 'leaveBy'>, now: number, until?: number | null): boolean {
  if (visit.leftAt) return false;
  const stored = visit.leaveBy ? Date.parse(visit.leaveBy) : NaN;
  const end = Math.max(Number.isNaN(stored) ? -Infinity : stored, until ?? -Infinity);
  return end === -Infinity || now < end;
}
