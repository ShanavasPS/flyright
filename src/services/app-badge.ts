import * as Notifications from 'expo-notifications';

/**
 * The number on the app icon. iOS shows it once the notification permission
 * (which includes badges) is granted; Android launchers vary — Samsung and
 * a few others count, Pixel's launcher only dots. Either way the OS answers
 * false rather than throwing, and a badge that can't show is not a failure
 * worth surfacing.
 */
export async function setAppBadge(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count)));
  } catch (error) {
    console.warn('[app-badge] could not set', error);
  }
}
