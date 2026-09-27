import { useMemo } from 'react';

import { currentHome, homeLookup, type CurrentHome, type HomeBaseState } from '@/services/home-base';
import { useHomeBase } from '@/services/home-base-store';
import type { JourneyRow } from '@/services/journeys';
import { localDateString } from '@/services/dates';
import type { RecapHome } from '@/services/timeline';
import type { HomeAt } from '@/services/trip-groups';

export interface HomeContext {
  state: HomeBaseState & { loaded: boolean };
  /** Today's home: a set period, else the automatic city. */
  current: CurrentHome | null;
  /** Per flight, for trip grouping; undefined while Automatic. */
  homeAt: HomeAt | undefined;
  /** For travelRecap: undefined while Automatic keeps its own rule. */
  recap: RecapHome | undefined;
}

/** The home base as the screens use it (docs/home-base.md). */
export function useHomeContext(userId: string | null | undefined, rows: JourneyRow[] | undefined): HomeContext {
  const state = useHomeBase(userId);
  const today = localDateString(new Date());
  return useMemo(() => {
    const journal = rows ?? [];
    const current = currentHome(state, journal, today);
    const homeAt = homeLookup(state);
    const recap: RecapHome | undefined = homeAt
      ? { current: current ? { city: current.city, departures: current.departures } : null, at: homeAt }
      : undefined;
    return { state, current, homeAt, recap };
  }, [state, rows, today]);
}
