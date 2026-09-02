import Storage from 'expo-sqlite/kv-store';
import { LogLevel, OneSignal } from 'react-native-onesignal';

import { ONESIGNAL_APP_ID } from '@/constants/config';
import { initLiveActivities } from '@/services/live-activity';

/**
 * OneSignal boundary: remote push registration, opt-in state, identity, and
 * segment tags. Local scheduled notifications (pre-trip reminders, claim
 * deadline countdowns, delay alerts) live in notification-lifecycle.ts.
 */
export function initNotifications() {
  if (!ONESIGNAL_APP_ID) {
    console.warn('[notifications] no OneSignal app id set — remote push disabled');
    return;
  }
  if (__DEV__) OneSignal.Debug.setLogLevel(LogLevel.Verbose);
  OneSignal.initialize(ONESIGNAL_APP_ID);
  // Registers the default Live Activity types so travel-day widgets can
  // start locally and receive REST-driven updates (no-op off iOS).
  initLiveActivities();
}

/** Ask at a meaningful moment (first journey added), never on first launch. */
export async function requestPushPermission(): Promise<boolean> {
  if (!ONESIGNAL_APP_ID) return false;
  return OneSignal.Notifications.requestPermission(false);
}

/** Whether the one-shot OS prompt is still unspent — priming surfaces (the
 * onboarding pitch, the remind-me-later sheet) only make sense while a tap
 * can actually summon the system dialog. */
export async function canPromptForPush(): Promise<boolean> {
  if (!ONESIGNAL_APP_ID) return false;
  if (await OneSignal.Notifications.getPermissionAsync()) return false;
  return OneSignal.Notifications.canRequestPermission();
}

/**
 * The user's opt-in intent, tracked locally. OneSignal's own `optedIn` flag
 * additionally requires a live APNs token, which simulators and devices
 * mid-registration don't have — keying the settings toggle on it makes the
 * toggle snap back off. Subscriptions default to opted in, so the absent key
 * means true.
 *
 * SUB_OPTED_IN_KEY mirrors our last optIn/optOut call to OneSignal. It can
 * lag OPT_IN_KEY: enabling while the OS permission is denied records the
 * intent but must NOT call optIn() — the SDK's optIn() unconditionally runs
 * requestPermission(fallbackToSettings: true), which pops OneSignal's own
 * undismissable-looking "Open Settings" alert on top of ours.
 */
const OPT_IN_KEY = 'push-opted-in';
const SUB_OPTED_IN_KEY = 'push-sub-opted-in';
const getOptInIntent = () => Storage.getItemSync(OPT_IN_KEY) !== 'false';

/** Opt the OneSignal subscription in. Only safe once the OS permission is
 * granted (or the prompt is about to be spent) — see SUB_OPTED_IN_KEY. */
function optInSubscription() {
  OneSignal.User.pushSubscription.optIn();
  Storage.setItemSync(SUB_OPTED_IN_KEY, 'true');
}

/**
 * Whether push is on from the user's point of view: the OS permission is
 * granted AND they haven't opted out in-app. Also settles a subscription
 * left opted out by a 'blocked' enable — once the user grants the
 * permission in system settings and this runs on foreground, the deferred
 * optIn fires (silently, since the permission is now granted).
 */
export async function getPushEnabled(): Promise<boolean> {
  if (!ONESIGNAL_APP_ID) return false;
  const enabled = (await OneSignal.Notifications.getPermissionAsync()) && getOptInIntent();
  if (enabled && Storage.getItemSync(SUB_OPTED_IN_KEY) === 'false') optInSubscription();
  return enabled;
}

/** 'blocked' = the OS permission is denied and the one-shot prompt is spent —
 * only the system settings screen can turn push back on. */
export type PushToggleResult = 'on' | 'off' | 'blocked';

/**
 * Enable: sort out the OS permission first (via the one-shot prompt if it's
 * still available), and opt the subscription in only once it's granted —
 * optIn() while the permission is denied triggers OneSignal's built-in
 * fallback-to-settings alert, stacking a second popup under ours. Disable:
 * opt out only — the OS permission stays granted, so re-enabling later is
 * instant and prompt-free. On 'blocked' the caller owns routing to system
 * settings; the recorded intent makes getPushEnabled() finish the deferred
 * optIn the moment the permission is granted there.
 */
export async function setPushEnabled(enabled: boolean): Promise<PushToggleResult> {
  if (!ONESIGNAL_APP_ID) return 'off';
  if (!enabled) {
    OneSignal.User.pushSubscription.optOut();
    Storage.setItemSync(SUB_OPTED_IN_KEY, 'false');
    Storage.setItemSync(OPT_IN_KEY, 'false');
    return 'off';
  }
  Storage.setItemSync(OPT_IN_KEY, 'true');
  if (await OneSignal.Notifications.getPermissionAsync()) {
    optInSubscription();
    return 'on';
  }
  if (await OneSignal.Notifications.canRequestPermission()) {
    if (await OneSignal.Notifications.requestPermission(false)) {
      optInSubscription();
      return 'on';
    }
    return 'off';
  }
  return 'blocked';
}

/**
 * Fires whenever the effective push state may have changed: the subscription
 * opting in/out, or the OS permission flipping (e.g. the user returning from
 * system settings). Returns an unsubscribe function.
 */
export function addPushStateListener(onChange: () => void): () => void {
  if (!ONESIGNAL_APP_ID) return () => {};
  OneSignal.User.pushSubscription.addEventListener('change', onChange);
  OneSignal.Notifications.addEventListener('permissionChange', onChange);
  return () => {
    OneSignal.User.pushSubscription.removeEventListener('change', onChange);
    OneSignal.Notifications.removeEventListener('permissionChange', onChange);
  };
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

/** Remote push taps. OneSignal delivers its own click events — they never
 * reach expo-notifications' response hook — so the router subscribes here
 * too. The payload's `data.url` (see convex/onesignal.ts) is passed through. */
export function addPushClickListener(onUrl: (url: string) => void): () => void {
  if (!ONESIGNAL_APP_ID) return () => {};
  const handler = (event: { notification: { additionalData?: unknown } }) => {
    const data = event.notification.additionalData as { url?: unknown } | undefined;
    if (typeof data?.url === 'string') onUrl(data.url);
  };
  OneSignal.Notifications.addEventListener('click', handler);
  return () => OneSignal.Notifications.removeEventListener('click', handler);
}
