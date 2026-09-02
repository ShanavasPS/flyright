import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';

import { toInAppPath } from '@/services/circle';
import { addPushClickListener } from '@/services/notifications';

/**
 * Routes notification taps to the screen the notification is about, via the
 * `url` field the lifecycle puts in every payload. useLastNotificationResponse
 * covers local notifications (cold start from a tap and taps while alive);
 * the OneSignal click listener covers remote follower pushes, which don't
 * surface through expo-notifications. Renders nothing; must be mounted
 * inside the router tree.
 */
export function NotificationRouter() {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string') router.push(toInAppPath(url) as Href);
  }, [response, router]);

  useEffect(() => addPushClickListener((url) => router.push(toInAppPath(url) as Href)), [router]);

  return null;
}
