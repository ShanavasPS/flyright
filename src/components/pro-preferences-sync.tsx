import { bindProAccount, receiveServerPro } from '@/services/server-pro';
import { useAuth } from '@clerk/expo';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useEffect } from 'react';

import { api } from '../../convex/_generated/api';
import { receiveProPreferences, useProPreferences } from '@/services/pro-prompts';

export function ProPreferencesSync() {
  const { userId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const local = useProPreferences(userId);
  const remote = useQuery(api.proPrompts.mine, isAuthenticated && userId ? { userId } : 'skip');
  const suppress = useMutation(api.proPrompts.suppress);
  useEffect(() => {
    bindProAccount(userId ?? null);
    if (userId && remote) { receiveProPreferences(userId, remote); receiveServerPro(userId, remote.proUntil); }
  }, [userId, remote]);
  useEffect(() => {
    if (!userId || !isAuthenticated || !local.loaded || !remote) return;
    if ((!local.introductionSeen || remote.introductionSeen) && (!local.homeDismissed || remote.homeDismissed)) return;
    // Keep retrying an unsynced suppression; an offline close survives a
    // reconnect even when the remote query's value hasn't changed.
    let busy = false;
    const save = () => {
      if (busy) return;
      busy = true;
      void suppress({ userId, introductionSeen: local.introductionSeen, homeDismissed: local.homeDismissed }).catch(() => {}).finally(() => { busy = false; });
    };
    save();
    const timer = setInterval(save, 30_000);
    return () => clearInterval(timer);
  }, [userId, isAuthenticated, local.loaded, local.introductionSeen, local.homeDismissed, remote, suppress]);
  return null;
}
