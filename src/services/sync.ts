/** SQLite writers used by the sync engine. Everything goes through the shared
 * `db` client so `enableChangeListener` fires and useLiveQuery screens update. */

import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { journeys } from '@/db/schema';
import type { RemoteJourney } from '@/services/sync-merge';

/** Claims the device's anonymous rows for the signed-in account. Idempotent.
 * Bumping updatedAt leaves the rows dirty so they upload on the next pass. */
export async function claimAnonymousJourneys(userId: string) {
  const now = new Date().toISOString();
  await db
    .update(journeys)
    .set({ userId, updatedAt: now })
    .where(isNull(journeys.userId));
}

/** Writes a remote winner into SQLite — a full-column upsert, unlike
 * addJourney's conflict path (which only revives tombstones). Setting
 * syncedAt = remote.updatedAt marks the row clean so it never echoes back. */
export async function applyRemoteJourney(remote: RemoteJourney, userId: string) {
  const columns = {
    userId,
    mode: remote.mode as (typeof journeys.$inferInsert)['mode'],
    carrier: remote.carrier,
    carrierCountry: remote.carrierCountry,
    number: remote.number,
    fromCode: remote.fromCode,
    fromCountry: remote.fromCountry,
    toCode: remote.toCode,
    toCountry: remote.toCountry,
    distanceKm: remote.distanceKm,
    scheduledDeparture: remote.scheduledDeparture,
    scheduledArrival: remote.scheduledArrival,
    ticketPriceAmount: remote.ticketPriceAmount,
    ticketPriceCurrency: remote.ticketPriceCurrency,
    source: remote.source as (typeof journeys.$inferInsert)['source'],
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
    deletedAt: remote.deletedAt,
    syncedAt: remote.updatedAt,
  };
  await db
    .insert(journeys)
    .values({ id: remote.naturalKey, ...columns })
    .onConflictDoUpdate({ target: journeys.id, set: columns });
}

/** After a confirmed push: mark rows clean. The updatedAt guard keeps a row
 * dirty if the user edited it while the push was in flight. */
export async function markJourneysSynced(rows: { id: string; updatedAt: string }[]) {
  for (const { id, updatedAt } of rows) {
    await db
      .update(journeys)
      .set({ syncedAt: updatedAt })
      .where(and(eq(journeys.id, id), eq(journeys.updatedAt, updatedAt)));
  }
}
