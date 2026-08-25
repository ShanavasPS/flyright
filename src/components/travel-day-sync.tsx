import { useAuth } from '@clerk/expo';
import { useConvexAuth, useMutation } from 'convex/react';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useRef } from 'react';

import { api } from '../../convex/_generated/api';

import { db } from '@/db/client';
import { travelDay } from '@/db/schema';
import { getActivityId } from '@/services/live-activity';
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
  const { data: rows } = useLiveQuery(db.select().from(travelDay));
  const busy = useRef(false);

  useEffect(() => {
    if (!userId || !isAuthenticated || !rows) return;
    if (busy.current) return;
    const dirty = rows.filter(isDirty);
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
  }, [userId, isAuthenticated, rows, setStage]);

  return null;
}
