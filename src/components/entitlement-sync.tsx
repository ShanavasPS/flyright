import { useConvexAuth, useAction } from 'convex/react';
import { useEffect } from 'react';

import { api } from '../../convex/_generated/api';

import { useHasPro } from '@/services/purchases';

/** Asks Convex to re-read the signed-in user's Pro entitlement from
 * RevenueCat whenever the SDK says they hold it — once per sign-in and
 * again the moment a purchase or restore lands. The RC webhook keeps the
 * server's mirror current after that; this closes the gaps it can't see
 * (pre-webhook purchases, anonymous purchases aliased to a Clerk id). See
 * entitlements.refreshMine. Renders nothing; mounted inside CloudSync. */
export function EntitlementSync() {
  const { isAuthenticated } = useConvexAuth();
  const pro = useHasPro();
  const refresh = useAction(api.entitlements.refreshMine);

  useEffect(() => {
    if (!isAuthenticated || !pro) return;
    refresh({}).catch(() => {});
  }, [isAuthenticated, pro, refresh]);

  return null;
}
