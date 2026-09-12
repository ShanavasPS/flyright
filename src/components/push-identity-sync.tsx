import { useUser } from '@clerk/expo';
import { useAction, useConvexAuth } from 'convex/react';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { api } from '../../convex/_generated/api';
import { logInNotifications, logOutNotifications } from '@/services/notifications';

/** A session may obtain only its own server-issued push alias. Never fall
 * back to a public user ID when the token service is unavailable. */
export function PushIdentitySync() {
  const { user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const mine = useAction(api.pushIdentity.mine);
  useEffect(() => {
    let cancelled = false;
    logOutNotifications();
    const bind = async () => {
      if (!isAuthenticated) return;
      try {
        const alias = await mine({});
        if (!cancelled && alias) logInNotifications(alias);
      } catch { /* Retry on foreground; never attach a public alias. */ }
    };
    void bind();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void bind(); });
    return () => { cancelled = true; subscription.remove(); logOutNotifications(); };
  }, [isAuthenticated, user?.id, mine]);
  return null;
}
