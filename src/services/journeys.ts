import { desc, eq } from 'drizzle-orm';
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
  return useLiveQuery(db.select().from(journeys).orderBy(desc(journeys.createdAt)));
}

/** A single journey by id, or undefined while loading / when missing. */
export function useJourney(id: string) {
  const { data } = useLiveQuery(
    db.select().from(journeys).where(eq(journeys.id, id)),
    [id],
  );
  return data?.[0];
}

export async function addJourney(row: NewJourneyRow) {
  // id is the natural key (number + date) — re-adding the same flight is a no-op.
  await db.insert(journeys).values(row).onConflictDoNothing();
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
