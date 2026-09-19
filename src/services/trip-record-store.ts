import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { journeys } from '@/db/schema';
import type { FlightFacts } from '@/services/travel-day';
import { airportPatch } from '@/services/trip-record';

/** Writes what the airport has posted into the trip's record (see
 * services/trip-record). Deliberately a bare update: it runs inside the
 * facts pipeline, whose callers reconcile the live surfaces themselves, so
 * it must not kick another reconcile. updatedAt moves only when something
 * changed, so the record follows the trip to the account's other devices
 * without a sync on every poll. */
export async function recordAirportFacts(journeyId: string, facts: FlightFacts): Promise<void> {
  const row = await db.select().from(journeys).where(eq(journeys.id, journeyId)).get();
  if (!row) return;
  const patch = airportPatch(row, facts);
  if (!patch) return;
  await db
    .update(journeys)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(journeys.id, journeyId));
}
