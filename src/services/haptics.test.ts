import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { playMoment } from '../../modules/flyright-haptics';
import { noteLanded, noteOwed, noteTakeOff, tick } from '@/services/haptics';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
  AndroidHaptics: { Segment_Tick: 'segment-tick' },
}));
jest.mock('../../modules/flyright-haptics', () => ({ playMoment: jest.fn() }));

const play = playMoment as jest.Mock;
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => jest.clearAllMocks());

describe('travel-day moments', () => {
  it('play the authored pattern and nothing else when the device can', async () => {
    play.mockResolvedValue(true);
    noteLanded();
    await flush();
    expect(play).toHaveBeenCalledWith('landed');
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('fall back to the nearest preset when the device or binary cannot', async () => {
    play.mockResolvedValue(false);
    noteOwed();
    noteTakeOff();
    await flush();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(Haptics.impactAsync).toHaveBeenCalledWith('heavy');
  });

  it('fall back when the native call itself fails', async () => {
    play.mockRejectedValue(new Error('engine'));
    noteLanded();
    await flush();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  });
});

describe('tick', () => {
  const os = Platform.OS;
  afterEach(() => {
    Platform.OS = os;
  });

  it('is the selection click on iOS and the segment tick on Android', () => {
    Platform.OS = 'ios';
    tick();
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    Platform.OS = 'android';
    tick();
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith('segment-tick');
  });
});
