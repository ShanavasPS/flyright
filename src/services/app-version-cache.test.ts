import Storage from 'expo-sqlite/kv-store';
import { cachedAppVersion, cacheAppVersion } from './app-version-cache';

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

it('preserves a confirmed update across restarts without persisting a force-update gate', () => {
  cacheAppVersion({ valid: false, minVersion: '1.0.33', latest: { version: '1.0.33', releasedAt: null } });
  const saved = jest.mocked(Storage.setItemSync).mock.calls[0][1];
  if (typeof saved !== 'string') throw new Error('Expected a serialized release');
  jest.mocked(Storage.getItemSync).mockReturnValue(saved);
  expect(cachedAppVersion()).toEqual({ valid: true, minVersion: '1.0.0', latest: { version: '1.0.33', releasedAt: null } });
});

it('does not replace a known update with a temporary store lookup failure', () => {
  cacheAppVersion({ valid: true, minVersion: '1.0.0', latest: null });
  expect(Storage.setItemSync).not.toHaveBeenCalled();
});

it('ignores malformed cache data', () => {
  for (const value of ['broken', 'null', '{"latest":{"version":"pending"}}']) {
    jest.mocked(Storage.getItemSync).mockReturnValue(value);
    expect(cachedAppVersion()).toBeUndefined();
  }
});
