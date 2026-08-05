// Web build of the notifications boundary. react-native-onesignal is
// native-only; the web app neither registers push nor schedules local
// notifications.

export function initNotifications() {}

export async function requestPushPermission(): Promise<boolean> {
  return false;
}

export function setUserTag(_key: string, _value: string) {}

export async function scheduleDeadlineReminder(_opts: {
  claimId: string;
  title: string;
  body: string;
  fireDate: Date;
}): Promise<string> {
  return '';
}
