// Web build — no notification surfaces, same no-op pattern as
// notification-lifecycle.web.ts.

import type { FlightStatus } from '@/services/flight-lookup';
import { EMPTY_FACTS, type FlightFacts } from '@/services/travel-day';
import { withRecord, type RecordRow } from '@/services/trip-record';

export function getTravelDayEnabled(): boolean {
  return false;
}

export function setTravelDayEnabled(_enabled: boolean): void {}

export async function noteFlightFacts(_journeyId: string, _status: FlightStatus): Promise<void> {}

export function getFlightFacts(_journeyId: string): FlightFacts {
  return EMPTY_FACTS;
}

export function factsFor(row: { id: string } & RecordRow): FlightFacts {
  return withRecord(EMPTY_FACTS, row);
}

export function reconcileTravelDay(): Promise<void> {
  return Promise.resolve();
}
