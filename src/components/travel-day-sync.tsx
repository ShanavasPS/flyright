import { useAuth } from '@clerk/expo';
import { useConvexAuth, useMutation } from 'convex/react';
import { useEffect, useRef } from 'react';

import { api } from '../../convex/_generated/api';
import { tripIsOver } from '../../convex/liveShared';

import { db } from '@/db/client';
import { journeys, travelDay } from '@/db/schema';
import { getActivityId } from '@/services/live-activity';
import { useLiveRows } from '@/services/live-rows';
import { isDirty, markTravelDaySynced, rowToState } from '@/services/travel-day-store';

/** Push-only mirror of the traveler's stage state into the Convex live
 * session. The device is the sole writer, so there's no pull/merge — a dirty
 * row just uploads (the mutation no-ops for unshared trips, which still
 * clears the dirty flag: nothing to fan out until the user shares, and
 * live.start snapshots the state at share time). Renders nothing; mounted
 * inside CloudSync next to JourneySync. */
export function TravelDaySync() {
  const { userId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const setStage = useMutation(api.live.setStage);
  const { data: rows } = useLiveRows(db.select().from(travelDay));
  const { data: trips } = useLiveRows(
    db
      .select({ id: journeys.id, scheduledArrival: journeys.scheduledArrival, toCode: journeys.toCode })
      .from(journeys),
  );
  const busy = useRef(false);

  useEffect(() => {
    if (!userId || !isAuthenticated || !rows || !trips) return;
    if (busy.current) return;
    // Trips that already flew are history: a status refresh can still backfill
    // their timeline (mergeFlightStages) and re-dirty the row weeks later, and
    // uploading that is neither news to a circle nor a session worth opening.
    const now = Date.now();
    const tripById = new Map(trips.map((t) => [t.id, t]));
    const dirty = rows.filter((row) => {
      if (!isDirty(row)) return false;
      const trip = tripById.get(row.journeyId);
      return !trip || !tripIsOver(trip.scheduledArrival, now, trip.toCode);
    });
    if (!dirty.length) return;

    busy.current = true;
    void (async () => {
      try {
        for (const row of dirty) {
          const state = rowToState(row);
          await setStage({
            naturalKey: row.journeyId,
            stage: state.stage,
            stamps: state.stamps as Record<string, string>,
            activityId: getActivityId(row.journeyId),
          });
          await markTravelDaySynced(row);
        }
      } catch {
        // Rows stay dirty; the next local change retries.
      } finally {
        busy.current = false;
      }
    })();
  }, [userId, isAuthenticated, rows, trips, setStage]);

  return null;
}
