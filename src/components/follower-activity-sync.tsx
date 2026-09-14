import { useAuth } from '@clerk/expo';
import { useConvexAuth, useQuery } from 'convex/react';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { api } from '../../convex/_generated/api';
import { endOrphanFollowerActivities } from '../../modules/flyright-live-activities';

/** Wait for authenticated data before sweeping, including on cold launch.
 * Sign-out removes the account's cards even though its remote follow remains. */
export function FollowerActivitySync() {
  const { isLoaded, userId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const ids = useQuery(api.followerActivities.mine, isAuthenticated && Platform.OS === 'ios' ? {} : 'skip');
  useEffect(() => {
    if (Platform.OS !== 'ios' || !isLoaded || (userId && (!isAuthenticated || ids === undefined))) return;
    const cleanup = () => { void endOrphanFollowerActivities(userId ? ids ?? [] : []).catch(() => {}); };
    cleanup();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') cleanup(); });
    return () => listener.remove();
  }, [isLoaded, userId, isAuthenticated, ids]);
  return null;
}
