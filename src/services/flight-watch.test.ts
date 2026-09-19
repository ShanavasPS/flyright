import { setAppBadge } from '@/services/app-badge';
import { fetchAppVersion } from '@/hooks/use-app-version';

import { badgeStoreUpdate } from './flight-watch';

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Available: 2 },
}));
jest.mock('@/db/client', () => ({ db: {} }));
jest.mock('@/services/app-badge', () => ({ setAppBadge: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/hooks/use-app-version', () => ({
  ...jest.requireActual('@/hooks/use-app-version'),
  installedVersion: () => '1.0.38',
  fetchAppVersion: jest.fn(),
}));
jest.mock('@/services/flight-lookup', () => ({ lookupFlight: jest.fn(), FlightLookupError: class {} }));
jest.mock('@/services/notification-lifecycle', () => ({}));
jest.mock('@/services/purchases', () => ({ proLocked: jest.fn() }));
jest.mock('@/services/schedule-change-lifecycle', () => ({}));
jest.mock('@/services/travel-day-lifecycle', () => ({}));
jest.mock('@/services/disruptions', () => ({}));
jest.mock('@/services/journeys', () => ({}));

const answer = (version: string | null) =>
  ({ valid: true, storeUrl: null, latest: version ? { version, releasedAt: null } : null, notes: [] }) as never;

beforeEach(() => jest.clearAllMocks());

describe('badgeStoreUpdate', () => {
  it('badges the icon while the app is shut when the store has a newer release', async () => {
    jest.mocked(fetchAppVersion).mockResolvedValue(answer('1.0.39'));
    await badgeStoreUpdate();
    // Only the update is known here; the other sources are left as they are.
    expect(setAppBadge).toHaveBeenCalledWith({ people: null, support: null, update: 1 });
  });

  it('leaves the icon alone when the installed build is current', async () => {
    jest.mocked(fetchAppVersion).mockResolvedValue(answer('1.0.38'));
    await badgeStoreUpdate();
    expect(setAppBadge).not.toHaveBeenCalled();
  });

  it('never throws when the check fails', async () => {
    jest.mocked(fetchAppVersion).mockRejectedValue(new Error('offline'));
    await expect(badgeStoreUpdate()).resolves.toBeUndefined();
    expect(setAppBadge).not.toHaveBeenCalled();
  });
});
