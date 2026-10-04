import { useAuth } from '@clerk/expo';
import { useMemo } from 'react';

import { homeCheck } from '@/services/home-base';
import { useHomeBase } from '@/services/home-base-store';
import type { JourneyRow } from '@/services/journeys';
import { chosenPlan, type StagePlan, type TravelDayState } from '@/services/travel-day';
import { stagePlans } from '@/services/travel-day-plan';

/** Each leg's trip progress steps: the ones the traveller chose in the
 * editor, else the suggested walk — read off the journal (its place in the
 * itinerary) and the home base (leaving home or the hotel, arriving at the
 * hotel or home). Every surface that draws or syncs the steps asks here, so
 * the trip page, the hero, the lock screen and followers agree. */
export function useStepPlans(
  journeys: JourneyRow[] | undefined,
  stateOf: (journeyId: string) => Pick<TravelDayState, 'plan' | 'stamps'>,
): (journeyId: string) => StagePlan {
  const { userId } = useAuth();
  const home = useHomeBase(userId);
  const suggested = useMemo(() => {
    const rows = journeys ?? [];
    return stagePlans(rows, homeCheck(home, rows));
  }, [journeys, home]);
  return useMemo(() => (journeyId: string) => chosenPlan(stateOf(journeyId), suggested(journeyId)), [stateOf, suggested]);
}
