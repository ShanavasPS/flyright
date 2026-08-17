import * as Notifications from 'expo-notifications';
import { LogLevel, OneSignal } from 'react-native-onesignal';

import { ONESIGNAL_APP_ID } from '@/constants/config';

/**
 * Two notification channels, one boundary:
 *  - OneSignal: remote push — disruption alerts ("LH873 landed 3h12m late — you're
 *    likely owed €400"), re-engagement journeys, escalation nudges.
 *  - expo-notifications: local scheduled — statutory deadline countdowns that must
 *    fire even fully offline.
 */
export function initNotifications() {
  if (!ONESIGNAL_APP_ID) {
    console.warn('[notifications] no OneSignal app id set — remote push disabled');
    return;
  }
  if (__DEV__) OneSignal.Debug.setLogLevel(LogLevel.Verbose);
  OneSignal.initialize(ONESIGNAL_APP_ID);
}

/** Ask at a meaningful moment (first journey added), never on first launch. */
export async function requestPushPermission(): Promise<boolean> {
  if (!ONESIGNAL_APP_ID) return false;
  return OneSignal.Notifications.requestPermission(false);
}

/** Tag the device so OneSignal journeys can segment (e.g. has_open_claim). */
export function setUserTag(key: string, value: string) {
  if (!ONESIGNAL_APP_ID) return;
  OneSignal.User.addTag(key, value);
}

/**
 * Attach this device's subscription to the signed-in user. The external id is
 * the Clerk user id — the same key RevenueCat uses — so journeys and the
 * backend can target by user across devices and tools. Email rides along
 * whenever Clerk knows it (anonymous users never reach this call).
 */
export function logInNotifications(userId: string, email?: string) {
  if (!ONESIGNAL_APP_ID) return;
  OneSignal.login(userId);
  if (email) OneSignal.User.addEmail(email);
}

/** Detach from the identified user; the device continues as anonymous. */
export function logOutNotifications() {
  if (!ONESIGNAL_APP_ID) return;
  OneSignal.logout();
}

export async function scheduleDeadlineReminder(opts: {
  claimId: string;
  title: string;
  body: string;
  fireDate: Date;
}) {
  return Notifications.scheduleNotificationAsync({
    content: { title: opts.title, body: opts.body, data: { claimId: opts.claimId } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: opts.fireDate },
  });
}
