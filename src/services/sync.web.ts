// Web build — no SQLite, no sync. Same API surface as sync.ts.

import type { RemoteJourney } from '@/services/sync-merge';

export async function claimAnonymousJourneys(_userId: string): Promise<void> {}

export async function applyRemoteJourney(
  _remote: RemoteJourney,
  _userId: string,
): Promise<void> {}

export async function markJourneysSynced(
  _rows: { id: string; updatedAt: string }[],
): Promise<void> {}
