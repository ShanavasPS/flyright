import { useAuth } from '@clerk/expo';
import { useEffect } from 'react';

import { logInPurchases, logOutPurchases } from '@/services/purchases';

/**
 * Mirrors the Clerk session into RevenueCat: signed in → the Clerk user id
 * becomes the RevenueCat app_user_id (same id purchases-js uses on the web
 * funnel), signed out → back to an anonymous customer. Must be mounted inside
 * ClerkProvider. Renders nothing.
 */
export function PurchasesIdentitySync() {
  const { isLoaded, userId } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    if (userId) void logInPurchases(userId);
    else void logOutPurchases();
  }, [isLoaded, userId]);

  return null;
}
