import { useAuth } from '@clerk/expo';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useEffect } from 'react';

import { api } from '../../convex/_generated/api';
import { receiveHomeBase, useHomeBase } from '@/services/home-base-store';

/** Keeps the account's home base the same on every signed-in device: the
 * newer copy wins in both directions (docs/home-base.md). */
export function HomeBaseSync() {
  const { userId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const local = useHomeBase(userId);
  const remote = useQuery(api.homeBase.mine, isAuthenticated && userId ? {} : 'skip');
  const save = useMutation(api.homeBase.save);

  useEffect(() => {
    if (userId && remote) receiveHomeBase(userId, remote);
  }, [userId, remote]);

  useEffect(() => {
    if (!userId || !isAuthenticated || !local.loaded || remote === undefined) return;
    if (!local.updatedAt || (remote && remote.updatedAt >= local.updatedAt)) return;
    // Keep retrying an unsynced change; an offline edit survives a reconnect.
    let busy = false;
    const push = () => {
      if (busy) return;
      busy = true;
      void save({ periods: local.periods, dismissed: local.dismissed, updatedAt: local.updatedAt })
        .catch(() => {})
        .finally(() => { busy = false; });
    };
    push();
    const timer = setInterval(push, 30_000);
    return () => clearInterval(timer);
  }, [userId, isAuthenticated, local.loaded, local.updatedAt, local.periods, local.dismissed, remote, save]);

  return null;
}
