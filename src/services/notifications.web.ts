// Web build of the notifications boundary. react-native-onesignal is
// native-only; the web app neither registers push nor schedules local
// notifications.

export function initNotifications() {}

export async function requestPushPermission(): Promise<boolean> {
  return false;
}

export async function canPromptForPush(): Promise<boolean> {
  return false;
}

export async function getPushEnabled(): Promise<boolean> {
  return false;
}

export type PushToggleResult = 'on' | 'off' | 'blocked';

export async function setPushEnabled(_enabled: boolean): Promise<PushToggleResult> {
  return 'off';
}

export function addPushStateListener(_onChange: () => void): () => void {
  return () => {};
}

export function setUserTag(_key: string, _value: string) {}

export function logInNotifications(_userId: string, _email?: string) {}

export function logOutNotifications() {}
