import * as Updates from 'expo-updates';

import {
  FOREGROUND_CHECK_GAP_MS,
  RELOAD_AFTER_AWAY_MS,
  describeRunningUpdate,
  fetchPendingUpdate,
  shouldCheck,
  shouldReload,
} from './ota-update';

// Getters, so a test can change the "running update" after the module
// interop has copied the mock's properties.
const mockState = { isEmbeddedLaunch: false, channel: 'production' as string | null };
jest.mock('expo-updates', () => ({
  isEnabled: true,
  updateId: '3f2a9c1d-7b8e-4c21-9d0a-5e6f7a8b9c0d',
  get isEmbeddedLaunch() {
    return mockState.isEmbeddedLaunch;
  },
  get channel() {
    return mockState.channel;
  },
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
}));

const T0 = Date.parse('2026-10-08T12:00:00Z');

describe('shouldCheck', () => {
  it('waits an hour between foreground checks', () => {
    expect(shouldCheck(T0, T0 + FOREGROUND_CHECK_GAP_MS - 1)).toBe(false);
    expect(shouldCheck(T0, T0 + FOREGROUND_CHECK_GAP_MS)).toBe(true);
  });
});

describe('shouldReload', () => {
  it('restarts only into a waiting update after a long absence', () => {
    const away = T0 - RELOAD_AFTER_AWAY_MS;
    expect(shouldReload(true, away, T0)).toBe(true);
    // Back after a short errand: the traveller's place in the app wins.
    expect(shouldReload(true, T0 - 20 * 60_000, T0)).toBe(false);
    // Nothing downloaded, or never backgrounded (a fresh launch).
    expect(shouldReload(false, away, T0)).toBe(false);
    expect(shouldReload(true, null, T0)).toBe(false);
  });
});

describe('describeRunningUpdate', () => {
  afterEach(() => {
    mockState.isEmbeddedLaunch = false;
    mockState.channel = 'production';
  });

  it('names the running update and its channel', () => {
    expect(describeRunningUpdate()).toBe('update 3f2a9c1d (production)');
  });

  it('is silent for the bundle the binary shipped with', () => {
    mockState.isEmbeddedLaunch = true;
    expect(describeRunningUpdate()).toBe('');
  });

  it('leaves the channel out when the build has none', () => {
    mockState.channel = null;
    expect(describeRunningUpdate()).toBe('update 3f2a9c1d');
  });
});

describe('fetchPendingUpdate', () => {
  // Jest runs with __DEV__ set, where the Updates API is unavailable: the
  // service must say "nothing waiting" without touching it.
  it('does nothing in a development build', async () => {
    await expect(fetchPendingUpdate()).resolves.toBe(false);
    expect(Updates.checkForUpdateAsync).not.toHaveBeenCalled();
  });
});
