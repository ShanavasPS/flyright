import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { disruptions } from '@/db/schema';

export type DisruptionRow = typeof disruptions.$inferSelect;

/**
 * Local cache of delays the app has observed — written whenever a status
 * lookup sees one (adding a flight, opening its detail). Lets the journeys
 * list badge owed rows through the pure rules engine without hitting the
 * flight-status API once per row.
 */
export async function recordDelay(journeyId: string, delayMinutes: number): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(disruptions)
    .values({
      id: `delay-${journeyId}`,
      journeyId,
      type: 'delay',
      delayMinutes,
      detectedAt: now,
    })
    .onConflictDoUpdate({
      target: disruptions.id,
      set: { delayMinutes, detectedAt: now },
    });
}

/** All recorded disruptions, live. */
export function useDisruptions() {
  return useLiveQuery(db.select().from(disruptions));
}
