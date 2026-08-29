// Web build — same static-fallback pattern as journeys.web.ts.

import { EMPTY_TRAVEL_DAY, type FlightFacts, type TravelDayState, type TravelStage } from '@/services/travel-day';

export interface TravelDayRow {
  journeyId: string;
  stage: string | null;
  stamps: string;
  activityStartedAt: string | null;
  endedAt: string | null;
  updatedAt: string;
  syncedAt: string | null;
}

export function rowToState(_row: TravelDayRow | undefined): TravelDayState {
  return EMPTY_TRAVEL_DAY;
}

export function useTravelDay(_journeyId: string): TravelDayState {
  return EMPTY_TRAVEL_DAY;
}

export function useTravelDayStates(): (journeyId: string) => TravelDayState {
  return () => EMPTY_TRAVEL_DAY;
}

export async function advanceStage(
  _journeyId: string,
  _target: TravelStage,
  _manualTrip = false,
): Promise<void> {}

export async function undoStage(_journeyId: string, _manualTrip = false): Promise<void> {}

export async function rewindStage(
  _journeyId: string,
  _target: TravelStage,
  _manualTrip = false,
): Promise<void> {}

export async function mergeFlightStages(_journeyId: string, _facts: FlightFacts): Promise<void> {}

export async function markActivity(
  _journeyId: string,
  _fields: Partial<Pick<TravelDayRow, 'activityStartedAt' | 'endedAt'>>,
): Promise<void> {}

export async function allTravelDayRows(): Promise<TravelDayRow[]> {
  return [];
}
