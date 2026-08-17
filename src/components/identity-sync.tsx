import { useUser } from '@clerk/expo';
import { useEffect } from 'react';

import { logInNotifications, logOutNotifications } from '@/services/notifications';
import { logInPurchases, logOutPurchases } from '@/services/purchases';

/**
 * Mirrors the Clerk session into RevenueCat and OneSignal: signed in → the
 * Clerk user id becomes the RevenueCat app_user_id (same id purchases-js uses
 * on the web funnel) and the OneSignal external id, with the email attached
 * once Clerk knows it; signed out → back to anonymous in both. Anonymous
 * sessions send nothing — the app works without an account. Must be mounted
 * inside ClerkProvider. Renders nothing.
 */
export function IdentitySync() {
  const { isLoaded, user } = useUser();
  const userId = user?.id;
  const email = user?.primaryEmailAddress?.emailAddress;

  useEffect(() => {
    if (!isLoaded) return;
    if (userId) {
      void logInPurchases(userId, email);
      logInNotifications(userId, email);
    } else {
      void logOutPurchases();
      logOutNotifications();
    }
  }, [isLoaded, userId, email]);

  return null;
}
