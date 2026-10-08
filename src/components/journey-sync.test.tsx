import { act, create } from 'react-test-renderer';

import { JourneySync } from './journey-sync';

const mockApply = jest.fn(), mockPush = jest.fn(), mockMarkSynced = jest.fn();
const mockReconcileNotifications = jest.fn(), mockReconcileTravelDay = jest.fn();
let mockPlan = { pushRows: [] as { id: string; updatedAt: string }[], applyLocally: [] as object[] };
let mockRemote: object[] | undefined = [];

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ isLoaded: true, userId: 'traveller' }) }));
jest.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useQuery: () => mockRemote,
  useMutation: () => mockPush,
}));
jest.mock('../../convex/_generated/api', () => ({ api: { journeys: { list: 'list', push: 'push' } } }));
jest.mock('@/db/client', () => ({ db: { select: () => ({ from: () => 'query' }) } }));
jest.mock('@/db/schema', () => ({ journeys: {} }));
jest.mock('@/services/live-rows', () => ({ useLiveRows: () => ({ data: [] }) }));
jest.mock('@/services/sync-merge', () => ({ planSync: () => mockPlan, toRemoteJourney: (r: object) => r }));
jest.mock('@/services/sync', () => ({
  applyRemoteJourney: (...args: unknown[]) => mockApply(...args),
  claimAnonymousJourneys: jest.fn(),
  markJourneysSynced: (...args: unknown[]) => mockMarkSynced(...args),
}));
jest.mock('@/services/notification-lifecycle', () => ({ reconcileNotifications: () => mockReconcileNotifications() }));
jest.mock('@/services/travel-day-lifecycle', () => ({ reconcileTravelDay: () => mockReconcileTravelDay() }));

let tree: ReturnType<typeof create> | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  mockApply.mockResolvedValue(undefined);
  mockPush.mockResolvedValue(undefined);
  mockMarkSynced.mockResolvedValue(undefined);
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
});

const mount = async () => {
  await act(async () => {
    tree = create(<JourneySync />);
  });
};

it('reconciles reminders and the travel-day surfaces once cloud flights land locally', async () => {
  // A fresh install: the launch reconcile saw an empty journal, then the
  // sync pulls the account's flights down — the widget must be rebuilt.
  mockPlan = { pushRows: [], applyLocally: [{ naturalKey: 'AY1337-2026-10-08' }, { naturalKey: 'AY1338-2026-10-10' }] };
  await mount();
  expect(mockApply).toHaveBeenCalledTimes(2);
  expect(mockReconcileNotifications).toHaveBeenCalledTimes(1);
  expect(mockReconcileTravelDay).toHaveBeenCalledTimes(1);
  // Both run after the last row is written, so they read the whole journal.
  const lastApply = mockApply.mock.invocationCallOrder.at(-1)!;
  expect(mockReconcileTravelDay.mock.invocationCallOrder[0]).toBeGreaterThan(lastApply);
});

it('leaves the surfaces alone when the pass only uploads local rows', async () => {
  mockPlan = { pushRows: [{ id: 'local-1', updatedAt: '2026-10-08T05:00:00.000Z' }], applyLocally: [] };
  await mount();
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockMarkSynced).toHaveBeenCalledTimes(1);
  expect(mockReconcileNotifications).not.toHaveBeenCalled();
  expect(mockReconcileTravelDay).not.toHaveBeenCalled();
});

it('does nothing with nothing to merge', async () => {
  mockPlan = { pushRows: [], applyLocally: [] };
  await mount();
  expect(mockApply).not.toHaveBeenCalled();
  expect(mockReconcileTravelDay).not.toHaveBeenCalled();
});
