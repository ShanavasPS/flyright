import type { FlightPosition } from '@/services/flight-lookup';
import { pointAlong, type GeoRoute, type LatLng } from '@/services/geo';
import { offsetAlong } from '@/services/globe';

/**
 * Where to draw the aircraft of a flight in the air.
 *
 * Two sources, best first. A reported position (the provider's ADS-B fix,
 * see FlightPosition) is the truth, carried forward along its track at its
 * ground speed for the minutes since it was reported so the plane glides
 * between fixes instead of hopping. Fixes stop over oceans and thin out
 * between polls, so past FIX_MAX_AGE_MS the plane falls back to the
 * timetable: the fraction of the flight elapsed (services/travel-day's
 * flightProgress), placed along the route's arc. `source` says which, so
 * a caption can be honest about it.
 */

/** A reported position older than this is no better than the timetable. */
export const FIX_MAX_AGE_MS = 30 * 60_000;
/** How far forward a fix is carried: enough to cover a poll interval, not
 * enough to fly past the destination on final approach. */
const EXTRAPOLATE_MAX_MS = 10 * 60_000;
const KM_PER_NAUTICAL_MILE = 1.852;
/** The timetable never puts the plane on either airport — that is the
 * pulsing plane's place before departure and nothing's after landing. */
const PROGRESS_MIN = 0.02;
const PROGRESS_MAX = 0.98;

export interface PlanePlacement {
  coordinate: LatLng;
  /** Compass heading, degrees clockwise from north. */
  heading: number;
  source: 'reported' | 'estimated';
}

/** @param forward whether the flight flies the arc in its sample order
 * (route.from → route.to); see RoutePlane.forward. */
export function planeNow(
  route: Pick<GeoRoute, 'segments'>,
  forward: boolean,
  progress: number,
  fix: FlightPosition | null | undefined,
  now: number,
): PlanePlacement {
  if (fix) {
    const reportedAt = Date.parse(fix.reportedAt);
    const age = now - reportedAt;
    if (!Number.isNaN(reportedAt) && age <= FIX_MAX_AGE_MS) {
      const heading = fix.trackDeg ?? arcHeading(route, forward, progress);
      const carried = Math.min(Math.max(age, 0), EXTRAPOLATE_MAX_MS);
      const km =
        fix.groundSpeedKt != null && fix.trackDeg != null
          ? (fix.groundSpeedKt * KM_PER_NAUTICAL_MILE * carried) / 3_600_000
          : 0;
      const coordinate =
        km > 0
          ? offsetAlong(fix.latitude, fix.longitude, heading, km)
          : { latitude: fix.latitude, longitude: fix.longitude };
      return { coordinate, heading, source: 'reported' };
    }
  }
  const t = Math.min(PROGRESS_MAX, Math.max(PROGRESS_MIN, progress));
  const { coordinate, heading } = pointAlong(route.segments, forward ? t : 1 - t);
  return { coordinate, heading: forward ? heading : (heading + 180) % 360, source: 'estimated' };
}

function arcHeading(route: Pick<GeoRoute, 'segments'>, forward: boolean, progress: number): number {
  const t = Math.min(PROGRESS_MAX, Math.max(PROGRESS_MIN, progress));
  const { heading } = pointAlong(route.segments, forward ? t : 1 - t);
  return forward ? heading : (heading + 180) % 360;
}
