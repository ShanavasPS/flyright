// Web build of the claims store — same static-fallback pattern as
// journeys.web.ts: the web app renders the empty state only.

import type { Verdict } from '@/rules/types';
import type { ClaimRow, ClaimWithJourney } from './claims';

export type { ClaimRow, ClaimWithJourney };

export const RESPONSE_WINDOW_DAYS = 42;

export function useClaims(_currentUserId: string | null | undefined): {
  data: ClaimWithJourney[];
} {
  return { data: [] };
}

export function useClaimForJourney(_journeyId: string): ClaimRow | undefined {
  return undefined;
}

export async function saveClaim(_opts: {
  journeyId: string;
  userId: string | null | undefined;
  verdict: Verdict;
  sent: boolean;
}): Promise<void> {
  throw new Error('Claims are not supported on web yet.');
}

export async function recordOutcome(_id: string, _next: string): Promise<void> {}
