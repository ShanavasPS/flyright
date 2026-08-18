// Web build of the journeys store. expo-sqlite isn't wired up for web/static
// export, so this variant keeps the same API surface with static fallbacks —
// the web app renders the empty state and the demo verdict only.

import type { Journey } from '@/rules/types';
import type { JourneyRow, NewJourneyRow } from './journeys';

export type { JourneyRow, NewJourneyRow };

export function useDbReady() {
  return { success: true, error: undefined };
}

export function useJourneys(_currentUserId: string | null | undefined): { data: JourneyRow[] } {
  return { data: [] };
}

export function useJourney(
  _id: string,
  _currentUserId: string | null | undefined,
): JourneyRow | undefined {
  return undefined;
}

export async function addJourney(_row: NewJourneyRow): Promise<void> {
  throw new Error('Adding journeys is not supported on web yet.');
}

export async function deleteJourney(_id: string): Promise<void> {
  throw new Error('Deleting journeys is not supported on web yet.');
}

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
