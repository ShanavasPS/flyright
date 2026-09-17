import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create } from 'react-test-renderer';

import { PassAction } from '@/components/pass-card';
import { FlightLookupError, lookupFlight, type FlightStatus } from '@/services/flight-lookup';
import { useAddFlightDraft } from '@/services/add-flight-draft';
import { AddFlight } from './add-flight';

let mockSignedIn = false;
let mockAuthLoaded = true;
const mockPush = jest.fn();
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ userId: mockSignedIn ? 'traveller' : null, isSignedIn: mockSignedIn, isLoaded: mockAuthLoaded }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));
jest.mock('@/services/flight-lookup', () => ({
  ...jest.requireActual('@/services/flight-lookup'), lookupFlight: jest.fn(),
}));
jest.mock('@/services/journeys', () => ({ useJourney: () => ({ row: null, loaded: true }), addJourney: jest.fn() }));
jest.mock('@/services/document-imports', () => ({ registerDocument: jest.fn() }));
jest.mock('@/services/travel-documents', () => ({ promptForTravelDocument: jest.fn() }));
jest.mock('../../modules/flyright-document-import', () => ({ canImportDocuments: () => false }));
jest.mock('expo-observe', () => ({ Observe: { logEvent: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: jest.requireActual('react-native').View },
  ZoomIn: { springify: () => ({ duration: () => undefined }) },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/components/airline-logo', () => ({ AirlineLogo: () => null }));
jest.mock('@/components/boarding-pass-scanner', () => ({ BoardingPassScanner: () => null }));
jest.mock('@/components/year-sheet', () => ({ YearSheet: () => null }));
jest.mock('@/components/time-dialog', () => ({ TimeDialog: () => null }));
jest.mock('@/components/trip-audience', () => ({
  AudienceRow: () => null, useCircleFollowers: () => [],
  useVisibilityChooser: () => ({ choose: jest.fn(), sheet: null }),
}));
jest.mock('@/services/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('@/services/disruptions', () => ({ recordDelay: jest.fn() }));
jest.mock('@/services/trip-visibility-default', () => ({ getDefaultTripVisibility: () => 'private' }));
jest.mock('@/services/notification-lifecycle', () => ({ reconcileNotifications: jest.fn() }));
jest.mock('@/services/notifications', () => ({ requestPushPermission: jest.fn() }));

const flight: FlightStatus = {
  flight: 'AY1331', date: '2026-09-14', status: 'scheduled',
  delayMinutes: null, distanceKm: 1000, carrier: { name: 'Finnair', iata: 'AY' },
  carrierCountry: 'FI', from: { code: 'HEL', country: 'FI' }, to: { code: 'LHR', country: 'GB' },
  scheduledDeparture: null, scheduledArrival: null,
};
let client: QueryClient;
let screen: ReturnType<typeof create> | undefined;
// The result step, with the flight and day the earlier steps would have
// left in the shared draft.
const content = () => <QueryClientProvider client={client}><AddFlight step="result" /></QueryClientProvider>;
async function settle() { await act(async () => { await jest.advanceTimersByTimeAsync(20); }); }
async function mount() { await act(async () => { screen = create(content()); }); await settle(); }

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockSignedIn = false;
  mockAuthLoaded = true;
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  useAddFlightDraft.getState().reset({ flightNumber: 'AY1331', flightInput: 'AY1331', date: '2026-09-14' });
  jest.mocked(lookupFlight).mockReset().mockResolvedValue(flight);
});
afterEach(async () => {
  if (screen) await act(async () => screen!.unmount());
  screen = undefined;
  client.clear();
  jest.useRealTimers();
});

it('looks up the entered flight while signed out', async () => {
  await mount();
  expect(lookupFlight).toHaveBeenCalledWith('AY1331', '2026-09-14');
  expect(screen!.root.findAllByType(PassAction).some(action => action.props.label === 'Track this flight →')).toBe(true);
  expect(mockPush).not.toHaveBeenCalled();
});

it('waits for Clerk to load before spending a guest lookup', async () => {
  mockAuthLoaded = false;
  await mount();
  expect(lookupFlight).not.toHaveBeenCalled();
});

it('offers sign-in at the limit and retries the same flight under the new account', async () => {
  jest.mocked(lookupFlight).mockRejectedValueOnce(
    new FlightLookupError("You've used today's 5 guest lookups. Sign in to look up more flights.", 429, 'guest_quota_exceeded'),
  );
  await mount();
  const signIn = screen!.root.findAllByType(PassAction).find(action => action.props.label === 'Sign in →');
  expect(signIn).toBeDefined();
  act(() => signIn!.props.onPress());
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/sign-in', params: { next: '/add-result' } });

  mockSignedIn = true;
  await act(async () => screen!.update(content()));
  await settle();
  expect(lookupFlight).toHaveBeenCalledTimes(2);
  expect(lookupFlight).toHaveBeenLastCalledWith('AY1331', '2026-09-14');
  expect(screen!.root.findAllByType(PassAction).some(action => action.props.label === 'Track this flight →')).toBe(true);
});
