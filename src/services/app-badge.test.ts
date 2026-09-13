import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { clearPushGroup, getPushEnabled } from './notifications';
import { setAppBadge } from './app-badge';
import { attentionBadge } from './attention';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { LOW: 4 },
  setBadgeCountAsync: jest.fn().mockResolvedValue(true),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  getPresentedNotificationsAsync: jest.fn().mockResolvedValue([]),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notification'),
}));
jest.mock('./notifications', () => ({
  getPushEnabled: jest.fn().mockResolvedValue(true),
  clearPushGroup: jest.fn(),
}));

const NONE = { people: 0, support: 0, update: 0 };
beforeEach(() => { jest.clearAllMocks(); Platform.OS = 'ios'; });

it('keeps a single indicator for any combination of unread activity and updates', () => {
  expect(attentionBadge({ people: 3, support: 2, update: 1 })).toBe(1);
  expect(attentionBadge({ ...NONE, update: 1 })).toBe(1);
  expect(attentionBadge(NONE)).toBe(0);
});

it('does not erase a badge from a closed-app push while counts are loading', async () => {
  await setAppBadge({ ...NONE, people: null });
  await setAppBadge({ ...NONE, update: null });
  expect(Notifications.setBadgeCountAsync).not.toHaveBeenCalled();
  await setAppBadge({ ...NONE, people: 2, update: null });
  expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(1);
});

it('keeps an available update badged when People is read', async () => {
  await setAppBadge({ ...NONE, people: 3, update: 1 });
  await setAppBadge({ ...NONE, update: 1 });
  expect(Notifications.setBadgeCountAsync).toHaveBeenLastCalledWith(1);
  await setAppBadge(NONE);
  expect(Notifications.setBadgeCountAsync).toHaveBeenLastCalledWith(0);
});

it('serializes writes so a slow stale count cannot overwrite the latest one', async () => {
  let finish!: (value: boolean) => void;
  jest.mocked(Notifications.setBadgeCountAsync).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const first = setAppBadge({ ...NONE, people: 1 });
  const second = setAppBadge(NONE);
  await Promise.resolve();
  expect(Notifications.setBadgeCountAsync).toHaveBeenCalledTimes(1);
  finish(true);
  await Promise.all([first, second]);
  expect(Notifications.setBadgeCountAsync).toHaveBeenLastCalledWith(0);
});

it('creates quiet Android notifications to drive launcher dots without using the badge API', async () => {
  Platform.OS = 'android';
  await setAppBadge({ ...NONE, people: 2, update: 1 });
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('flyright-attention', expect.objectContaining({ showBadge: true, sound: null }));
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
    identifier: 'flyright-attention-update',
    content: expect.objectContaining({ data: { attention: 'update', url: '/whats-new' }, sound: false }),
  }));
  expect(Notifications.setBadgeCountAsync).not.toHaveBeenCalled();
});

it('clears only consumed Android sources, preserving an update and live flight notifications', async () => {
  Platform.OS = 'android';
  await setAppBadge({ ...NONE, update: 1 });
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('flyright-attention-people');
  expect(clearPushGroup).toHaveBeenCalledWith('flyright-attention-people');
  expect(clearPushGroup).not.toHaveBeenCalledWith('flyright-attention-update');
  expect(Notifications.setBadgeCountAsync).not.toHaveBeenCalled();
});

it('does not remove an Android update push before the store lookup finishes', async () => {
  Platform.OS = 'android';
  await setAppBadge({ ...NONE, people: 1, update: null });
  expect(clearPushGroup).not.toHaveBeenCalledWith('flyright-attention-update');
  expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalledWith('flyright-attention-update');
});

it('respects notification opt-out on Android', async () => {
  Platform.OS = 'android';
  jest.mocked(getPushEnabled).mockResolvedValueOnce(false);
  await setAppBadge({ ...NONE, update: 1 });
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('does not repost existing Android attention notifications on every foreground', async () => {
  Platform.OS = 'android';
  jest.mocked(Notifications.getPresentedNotificationsAsync).mockResolvedValueOnce([
    { request: { identifier: 'flyright-attention-update' } } as Notifications.Notification,
  ]);
  await setAppBadge({ ...NONE, update: 1 });
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});
