import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { pushStackFor, toInAppPath } from '@/services/circle';
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

  // Pushed in order, so a trip notification leaves the person underneath it
  // and the People tab underneath that (services/circle.pushStackFor).
  const open = useCallback(
    (url: string) => {
      for (const path of pushStackFor(toInAppPath(url))) router.push(path as Href);
    },
    [router],
  );

  useEffect(() => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string') open(url);
  }, [response, open]);

  useEffect(() => addPushClickListener(open), [open]);

  return null;
}
