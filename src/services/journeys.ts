import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import migrations from '../../drizzle/migrations';

import { db } from '@/db/client';
import { journeys } from '@/db/schema';
import type { Journey } from '@/rules/types';

export type JourneyRow = typeof journeys.$inferSelect;
export type NewJourneyRow = typeof journeys.$inferInsert;

/** Runs pending schema migrations once per app start. Gate DB access on `success`. */
export function useDbReady() {
  return useMigrations(db, migrations);
}

/** Rows visible to the current viewer: their own plus unclaimed anonymous
 * rows. Scoping by account keeps user B on user A's device from seeing A's
 * trips; after sign-out the previous account's rows are hidden, not deleted. */
function visibleTo(currentUserId: string | null | undefined) {
  return and(
    isNull(journeys.deletedAt),
    currentUserId
      ? or(isNull(journeys.userId), eq(journeys.userId, currentUserId))
      : isNull(journeys.userId),
  );
}

/** The viewer's journeys, newest first. Live — re-renders when rows change. */
export function useJourneys(currentUserId: string | null | undefined) {
  return useLiveQuery(
    db
      .select()
      .from(journeys)
      .where(visibleTo(currentUserId))
      .orderBy(desc(journeys.createdAt)),
    [currentUserId ?? ''],
  );
}

/** A single journey by id, or undefined while loading / when missing. */
export function useJourney(id: string, currentUserId: string | null | undefined) {
  const { data } = useLiveQuery(
    db.select().from(journeys).where(and(eq(journeys.id, id), visibleTo(currentUserId))),
    [id, currentUserId ?? ''],
  );
  return data?.[0];
}

export async function addJourney(row: NewJourneyRow) {
  const now = new Date().toISOString();
  // id is the natural key (number + date). Re-adding a soft-deleted trip
  // revives it; re-adding a live one is a no-op.
  await db
    .insert(journeys)
    .values({ ...row, updatedAt: row.updatedAt ?? now })
    .onConflictDoUpdate({
      target: journeys.id,
      set: { deletedAt: null, updatedAt: now },
    });
}

/** Edit a journal entry in place. The row id (= sync natural key) stays
 * stable even when the fields inside it change, so claims and disruptions
 * keep their reference and the cloud sync patches the same remote row. */
export async function updateJourney(
  id: string,
  fields: Partial<Omit<NewJourneyRow, 'id' | 'userId' | 'createdAt'>>,
) {
  await db
    .update(journeys)
    .set({ ...fields, updatedAt: new Date().toISOString() })
    .where(eq(journeys.id, id));
}

/** Soft delete — the tombstone lets a future cloud sync propagate removals. */
export async function deleteJourney(id: string) {
  const now = new Date().toISOString();
  await db
    .update(journeys)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(journeys.id, id));
}

/** DB row → the rules-engine shape. */
export function toDomainJourney(row: JourneyRow): Journey {
  return {
    id: row.id,
    mode: row.mode,
    carrier: row.carrier,
    carrierCountry: row.carrierCountry,
    number: row.number,
    from: { code: row.fromCode, country: row.fromCountry },
    to: { code: row.toCode, country: row.toCountry },
    distanceKm: row.distanceKm,
    scheduledDeparture: row.scheduledDeparture,
    scheduledArrival: row.scheduledArrival,
    ticketPrice:
      row.ticketPriceAmount != null && row.ticketPriceCurrency != null
        ? {
            amount: row.ticketPriceAmount,
            currency: row.ticketPriceCurrency as 'EUR' | 'GBP' | 'USD',
          }
        : undefined,
  };
}
