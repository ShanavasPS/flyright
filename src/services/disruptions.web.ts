// Web build — same static-fallback pattern as journeys.web.ts.

import type { DisruptionRow } from './disruptions';

export type { DisruptionRow };

export async function recordDelay(_journeyId: string, _delayMinutes: number): Promise<void> {}

export function useDisruptions(): { data: DisruptionRow[] } {
  return { data: [] };
}

export function useDisruption(_journeyId: string | undefined): DisruptionRow | undefined {
  return undefined;
}
