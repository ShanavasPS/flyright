import { useEffect, useState } from 'react';

import { lookupFlight } from '@/services/flight-lookup';
import { planeNow, type PlanePlacement } from '@/services/flight-position';
import type { GeoRoute } from '@/services/geo';
import { lookupDayFor } from '@/services/schedule-change-lifecycle';
import { flightProgress, type TravelDayState, type TravelJourney } from '@/services/travel-day';
import { getFlightFacts, noteFlightFacts } from '@/services/travel-day-lifecycle';

/** How often a screen showing a flight in the air asks after it. The
 * server's cache answers most of these for free (the travel-day poll chain
 * is already buying the same record), so this mostly picks up its work. */
const REFRESH_MS = 10 * 60_000;

export interface LivePlane extends PlanePlacement {
  /** The route pair the plane flies, as the globe keys it. */
  key: string;
  /** Fraction of the flight elapsed by the timetable, 0–1. */
  progress: number;
}

/**
 * Where to draw the aircraft of `journey` while it is in the air — null
 * before departure and after landing. The place comes from the flight's
 * cached facts (a reported position when there is a fresh one, the
 * timetable otherwise; see services/flight-position) and moves with `now`.
 * With `refresh`, a tracked flight's facts are re-fetched every few minutes
 * while the screen is up, so a reported position keeps arriving.
 */
export function useLivePlane(
  journey: TravelJourney | null,
  state: TravelDayState,
  route: GeoRoute | null,
  now: Date,
  refresh: boolean,
): LivePlane | null {
  const [, setRefreshed] = useState(0);
  const facts = journey ? getFlightFacts(journey.id) : null;
  const progress = journey && facts ? flightProgress(journey, state, facts, now) : 0;
  const airborne = !!journey && !!route && progress > 0 && progress < 1;

  const journeyId = journey?.id ?? null;
  const number = journey?.number ?? null;
  const lookupDay = journey ? lookupDayFor(journey) : null;
  const tracked = airborne && journey.source === 'lookup' && !!number;
  useEffect(() => {
    if (!tracked || !refresh || !journeyId || !number || !lookupDay) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await lookupFlight(number, lookupDay, { background: true });
        if (cancelled) return;
        await noteFlightFacts(journeyId, status);
        if (!cancelled) setRefreshed((n) => n + 1);
      } catch {
        // Signed out, out of allowance, or offline: the timetable carries on.
      }
    };
    const first = setTimeout(poll, 0);
    const id = setInterval(poll, REFRESH_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [tracked, refresh, journeyId, number, lookupDay]);

  if (!airborne || !journey || !route || !facts) return null;
  const leg = route.legs.find((candidate) => candidate.id === journey.id);
  const forward = leg ? leg.from.iata === route.from.iata : true;
  return { key: route.key, progress, ...planeNow(route, forward, progress, facts.position, now.getTime()) };
}
