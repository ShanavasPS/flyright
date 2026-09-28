import { useAuth } from '@clerk/expo';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';

import { api } from '../../convex/_generated/api';
import { autoHome } from '@/services/home-base';
import { receiveHomeBase, useHomeBase } from '@/services/home-base-store';
import { useJourneys } from '@/services/journeys';

/** Keeps the account's home base the same on every signed-in device: the
 * newer copy wins in both directions (docs/home-base.md). */
export function HomeBaseSync() {
  const { userId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const local = useHomeBase(userId);
  const remote = useQuery(api.homeBase.mine, isAuthenticated && userId ? {} : 'skip');
  const save = useMutation(api.homeBase.save);
  const saveAuto = useMutation(api.homeBase.saveAuto);
  const { data: journal } = useJourneys(userId);
  // The automatic home travels with the account so followers group this
  // traveller's trips the way this Flights tab does (convex/homeBaseShared).
  // The web build keeps no journal, so it has nothing to say about it.
  const auto = useMemo(() => {
    if (!journal || Platform.OS === 'web') return undefined;
    const found = autoHome(journal);
    return found ? { city: found.city, country: found.country } : null;
  }, [journal]);

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

  useEffect(() => {
    if (!userId || !isAuthenticated || auto === undefined || remote === undefined) return;
    const stored = remote?.auto ?? null;
    if (stored?.city === auto?.city && stored?.country === auto?.country) return;
    void saveAuto({ auto }).catch(() => {});
  }, [userId, isAuthenticated, auto, remote, saveAuto]);

  return null;
}
