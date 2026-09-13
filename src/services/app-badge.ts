import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { ATTENTION_CHANNEL, attentionBadge, attentionCopy, attentionId, type AttentionCounts, type AttentionSource } from './attention';
import { clearPushGroup, getPushEnabled } from './notifications';

/**
 * iOS supports an explicit badge; Android launchers such as Pixel require
 * an active notification. Keep quiet, replaceable notifications for each
 * attention source, removing only ours when that source is read.
 */
let writing: Promise<void> = Promise.resolve();

export function setAppBadge(counts: AttentionCounts): Promise<void> {
  // Permission and native calls are asynchronous. A slow write of an old
  // count must finish before the newer count is applied.
  writing = writing.then(() => writeBadge(counts)).catch((error) => {
    console.warn('[app-badge] could not set', error);
  });
  return writing;
}

async function writeBadge(counts: AttentionCounts): Promise<void> {
  if (Platform.OS === 'ios') {
    const badge = attentionBadge(counts);
    if (badge === null) return;
    const applied = await Notifications.setBadgeCountAsync(badge);
    if (!applied && badge) {
      console.warn('[app-badge] enable Badges in system notification settings for FlyRight');
    }
    return;
  }
  if (Platform.OS !== 'android') return;

  const enabled = await getPushEnabled();
  await Notifications.setNotificationChannelAsync(ATTENTION_CHANNEL, {
    name: 'Unread activity and app updates',
    importance: Notifications.AndroidImportance.LOW,
    showBadge: true,
    sound: null,
    enableVibrate: false,
  });
  const presented = await Notifications.getPresentedNotificationsAsync();
  for (const source of Object.keys(attentionCopy) as AttentionSource[]) {
    const count = counts[source];
    if (enabled && count === null) continue;
    const identifier = attentionId(source);
    if (!enabled || (count !== null && count <= 0)) {
      await Notifications.dismissNotificationAsync(identifier);
      clearPushGroup(identifier);
      continue;
    }
    if (presented.some((notification) => notification.request.identifier === identifier)) continue;
    const { url, ...copy } = attentionCopy[source];
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { ...copy, data: { url, attention: source }, sound: false, autoDismiss: false },
      trigger: { channelId: ATTENTION_CHANNEL },
    });
  }
  // Do not call setBadgeCountAsync(0) on Android: Expo's implementation
  // cancels ALL notifications, including the traveller's live flight.
}

export async function appBadgePermission(): Promise<boolean> {
  try {
    const permissions = await Notifications.getPermissionsAsync();
    return Platform.OS === 'ios' ? !!permissions.ios?.allowsBadge : permissions.granted;
  } catch {
    return false;
  }
}
