// Web build: no SQLite — lounge passes and visits live on the phone only,
// so the web shows none. Same API surface, like memberships.web.ts.

import type { loungePasses, loungeVisits } from '@/db/schema';

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

const NONE: never[] = [];

export function useLoungePasses(_userId: string | null | undefined): LoungePassRow[] | undefined {
  return NONE;
}

export function useLoungePass(_id: string | undefined): LoungePassRow | undefined {
  return undefined;
}

export function useLoungeVisits(_userId: string | null | undefined): LoungeVisitRow[] | undefined {
  return NONE;
}

export async function addLoungePass(): Promise<string> {
  throw new Error('Lounge passes are kept on your phone.');
}

export async function updateLoungePass(): Promise<void> {}

export async function deleteLoungePass(): Promise<void> {}

export async function logLoungeVisit(): Promise<string> {
  throw new Error('Lounge visits are kept on your phone.');
}

export async function leaveLoungeVisit(): Promise<void> {}

export async function undoLoungeVisit(): Promise<void> {}

export function isOngoing(visit: Pick<LoungeVisitRow, 'leftAt' | 'leaveBy'>, now: number, until?: number | null): boolean {
  if (visit.leftAt) return false;
  const stored = visit.leaveBy ? Date.parse(visit.leaveBy) : NaN;
  const end = Math.max(Number.isNaN(stored) ? -Infinity : stored, until ?? -Infinity);
  return end === -Infinity || now < end;
}
