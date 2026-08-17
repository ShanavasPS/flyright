import { and, desc, eq, isNull } from 'drizzle-orm';
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

/** All journeys, newest first. Live — re-renders when rows change. */
export function useJourneys() {
  return useLiveQuery(
    db.select().from(journeys).where(isNull(journeys.deletedAt)).orderBy(desc(journeys.createdAt)),
  );
}

/** A single journey by id, or undefined while loading / when missing. */
export function useJourney(id: string) {
  const { data } = useLiveQuery(
    db.select().from(journeys).where(and(eq(journeys.id, id), isNull(journeys.deletedAt))),
    [id],
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
