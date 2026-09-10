import { useSession, useUser } from '@clerk/expo';
import { useEffect, useRef } from 'react';

import { logInAnalytics, logOutAnalytics, trackAuth } from '@/services/analytics';
import { setNotificationViewer } from '@/services/notification-lifecycle';
import { logInNotifications, logOutNotifications } from '@/services/notifications';
import { logInPurchases, logOutPurchases } from '@/services/purchases';
import {
  clearSignedOutNotice,
  noteSignedOut,
  rememberSession,
} from '@/services/signed-out-notice';

/**
 * Mirrors the Clerk session into RevenueCat, OneSignal, and Layers: signed
 * in → the Clerk user id becomes the RevenueCat app_user_id (same id
 * purchases-js uses on the web funnel), the OneSignal external id, and the
 * Layers app user id (which is how Layers joins attribution to RevenueCat
 * revenue), with the email attached once Clerk knows it; signed out → back to
 * anonymous in all three. Anonymous
 * sessions send nothing — the app works without an account. Must be mounted
 * inside ClerkProvider. Renders nothing.
 *
 * Auth events: a session that already exists when Clerk loads is a restored
 * one and emits nothing; a later null → id transition is a sign-in that
 * happened in this run — `sign_up` if Clerk created the user moments before,
 * `login` otherwise (AuthView doesn't say which flow completed).
 *
 * Forced sign-outs: the active session's expiry is kept on disk, so when the
 * app is signed out it can tell a session that ran out (→ the "you were
 * signed out" notice) from one the user ended (see session-expiry.ts).
 */
/** How recently Clerk must have created the user for a new session to count
 * as a sign-up rather than a login — the OTP round trip fits comfortably. */
const SIGN_UP_WINDOW_MS = 5 * 60_000;

export function IdentitySync() {
  const { isLoaded, user } = useUser();
  const { session } = useSession();
  const userId = user?.id;
  const sessionId = session?.status === 'active' ? session.id : undefined;
  const sessionExpireAt = session?.status === 'active' ? session.expireAt.getTime() : undefined;
  const email = user?.primaryEmailAddress?.emailAddress;
  const createdAt = user?.createdAt?.getTime();
  // 'apple' / 'google' for social sign-in, 'email' for the OTP flow.
  const authMethod = user?.externalAccounts[0]?.provider.replace(/^oauth_/, '') ?? 'email';
  // undefined until Clerk has loaded once; null = known signed-out.
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    if (userId) {
      // Signed in: the notice (if any) has done its job, and this session is
      // the one to judge next time the app finds itself signed out.
      clearSignedOutNotice();
      if (sessionId && sessionExpireAt != null) {
        rememberSession({ id: sessionId, email: email ?? null, expireAt: sessionExpireAt });
      }
      void logInPurchases(userId, email);
      logInNotifications(userId, email);
      logInAnalytics(userId, {
        auth_method: authMethod,
        signup_date: createdAt ? new Date(createdAt).toISOString() : undefined,
      });
      if (previousUserId.current === null) {
        const isNewAccount = createdAt != null && Date.now() - createdAt < SIGN_UP_WINDOW_MS;
        trackAuth(isNewAccount ? 'sign_up' : 'login', authMethod);
      }
    } else {
      // Cold start after the session ran out, or it ran out (or was ended)
      // during this run — the remembered expiry says which.
      noteSignedOut();
      void logOutPurchases();
      logOutNotifications();
      logOutAnalytics();
    }
    previousUserId.current = userId ?? null;
    // Scheduled reminders scope to the same identity (see notification-lifecycle).
    setNotificationViewer(userId ?? null);
  }, [isLoaded, userId, email, createdAt, authMethod, sessionId, sessionExpireAt]);

  return null;
}
