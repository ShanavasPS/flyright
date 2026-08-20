import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';

/**
 * Routes notification taps to the screen the notification is about, via the
 * `url` field the lifecycle puts in every payload. useLastNotificationResponse
 * covers both a cold start from a tap and taps while the app is alive.
 * Renders nothing; must be mounted inside the router tree.
 */
export function NotificationRouter() {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string') router.push(url as Href);
  }, [response, router]);

  return null;
}
