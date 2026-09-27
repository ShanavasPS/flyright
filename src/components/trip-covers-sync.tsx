import { useAuth } from '@clerk/expo';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useEffect } from 'react';

import { api } from '../../convex/_generated/api';
import { coverList, receiveTripCovers, useTripCovers } from '@/services/trip-covers';

/** Keeps the photos chosen for trips the same on every signed-in device: the
 * newer copy wins in both directions (docs/trip-covers.md). */
export function TripCoversSync() {
  const { userId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const local = useTripCovers(userId);
  const remote = useQuery(api.tripCovers.mine, isAuthenticated && userId ? {} : 'skip');
  const save = useMutation(api.tripCovers.save);

  useEffect(() => {
    if (userId && remote) receiveTripCovers(userId, remote);
  }, [userId, remote]);

  useEffect(() => {
    if (!userId || !isAuthenticated || !local.loaded || remote === undefined) return;
    if (!local.updatedAt || (remote && remote.updatedAt >= local.updatedAt)) return;
    // Keep retrying an unsynced change; an offline edit survives a reconnect.
    let busy = false;
    const push = () => {
      if (busy) return;
      busy = true;
      void save({ covers: coverList(local.covers), updatedAt: local.updatedAt })
        .catch(() => {})
        .finally(() => { busy = false; });
    };
    push();
    const timer = setInterval(push, 30_000);
    return () => clearInterval(timer);
  }, [userId, isAuthenticated, local.loaded, local.updatedAt, local.covers, remote, save]);

  return null;
}
