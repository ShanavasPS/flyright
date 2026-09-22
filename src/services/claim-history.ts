/**
 * A claim's recorded outcomes with their dates (claims.status_history), so
 * the timeline can say "Compensation paid · 28 Jul" instead of an undated
 * step. Pure: services/claims writes it, the claim pane reads it.
 */
import type { ClaimStatus } from '@/services/claim-status';

export interface HistoryEntry {
  status: ClaimStatus;
  /** ISO timestamp of when the outcome was recorded in the app. */
  at: string;
}

const STATUSES: ReadonlySet<string> = new Set(['draft', 'sent', 'acknowledged', 'paid', 'rejected', 'escalated']);

/** The stored history; anything missing or malformed reads as none, so a
 * bad value can never break the claim it belongs to. */
export function parseHistory(json: string | null | undefined): HistoryEntry[] {
  if (!json) return [];
  try {
    const value = JSON.parse(json) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (e): e is HistoryEntry =>
        !!e &&
        typeof e === 'object' &&
        STATUSES.has((e as HistoryEntry).status) &&
        typeof (e as HistoryEntry).at === 'string' &&
        !Number.isNaN(Date.parse((e as HistoryEntry).at)),
    );
  } catch {
    return [];
  }
}

/** The history with one more outcome, serialized for the column. */
export function appendHistory(json: string | null | undefined, status: ClaimStatus, at: Date): string {
  return JSON.stringify([...parseHistory(json), { status, at: at.toISOString() }]);
}

/** When the claim reached `status`, if the app recorded it: the latest entry
 * for that status (a rejected claim can be escalated and rejected again). */
export function reachedAt(json: string | null | undefined, status: ClaimStatus): string | null {
  const hits = parseHistory(json).filter((e) => e.status === status);
  return hits.length ? hits[hits.length - 1].at : null;
}
