import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create } from 'react-test-renderer';

import { PrimaryButton } from '@/components/primary-button';
import { FINNAIR_RECEIPT } from '@/services/__fixtures__/itinerary-documents';
import { FlightLookupError, lookupFlight, type FlightStatus } from '@/services/flight-lookup';
import { extractItinerary } from '@/services/itinerary';
import { saveImportedJourney } from '@/services/journeys';
import { ImportDocument } from './import-document';

const mockDocument = { kind: 'pdf', name: 'five-flights.pdf', read: jest.fn() };
let mockSignedIn = true;
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ userId: mockSignedIn ? 'traveller' : null, isSignedIn: mockSignedIn, isLoaded: true }),
}));
jest.mock('@/services/document-imports', () => ({ importDocument: () => mockDocument }));
jest.mock('@/services/flight-lookup', () => ({
  ...jest.requireActual('@/services/flight-lookup'),
  lookupFlight: jest.fn(),
}));
jest.mock('@/services/journeys', () => ({
  useJourneys: () => ({ data: [] }),
  saveImportedJourney: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ handle: 'document', via: 'upload' }),
  useFocusEffect: jest.fn(),
}));
jest.mock('expo-observe', () => ({ Observe: { logEvent: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  ZoomIn: { springify: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/components/airline-logo', () => ({ AirlineLogo: () => null }));
jest.mock('@/components/year-sheet', () => ({ YearSheet: () => null }));
jest.mock('@/components/trip-audience', () => ({
  AudienceRow: () => null,
  useCircleFollowers: () => [],
  useVisibilityChooser: () => ({ choose: jest.fn(), sheet: null }),
}));
jest.mock('@/services/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('@/services/disruptions', () => ({ recordDelay: jest.fn() }));
jest.mock('@/services/trip-visibility-default', () => ({ getDefaultTripVisibility: () => 'private' }));
jest.mock('@/services/notification-lifecycle', () => ({ reconcileNotifications: jest.fn() }));
jest.mock('@/services/notifications', () => ({ requestPushPermission: jest.fn().mockResolvedValue(undefined) }));

const TODAY = new Date(2026, 8, 13, 12);
const segments = extractItinerary(FINNAIR_RECEIPT, TODAY).segments;
type PendingLookup = { resolve: (flight: FlightStatus) => void; reject: (error: Error) => void };
let pending: Map<string, PendingLookup>;
let client: QueryClient;
let screen: ReturnType<typeof create> | undefined;

function resultFor(index: number): FlightStatus {
  const segment = segments[index];
  return {
    flight: segment.flight!, date: segment.date!, status: 'scheduled', landed: false,
    delayMinutes: null, distanceKm: 1000, carrier: { name: 'Finnair', iata: 'AY' },
    carrierCountry: 'FI', from: { code: segment.fromCode, country: 'FI' },
    to: { code: segment.toCode, country: 'SE' }, scheduledDeparture: null, scheduledArrival: null,
  };
}

async function flushQueries() {
  // React Query batches observer notifications on a timer.
  await act(async () => { await jest.advanceTimersByTimeAsync(20); });
}

async function mount() {
  await act(async () => {
    screen = create(<QueryClientProvider client={client}><ImportDocument /></QueryClientProvider>);
  });
  await flushQueries();
}

async function finish(...indices: number[]) {
  await act(async () => {
    for (const index of indices) pending.get(segments[index].flight!)!.resolve(resultFor(index));
  });
  await flushQueries();
}

const button = () => screen!.root.findByType(PrimaryButton);
const pressAdd = async () => { await act(async () => { await button().props.onPress(); }); };
const savedFlights = () => jest.mocked(saveImportedJourney).mock.calls.map(([segment]) => segment.flight);

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(TODAY);
  jest.clearAllMocks();
  // The parser's development-only document dump adds no evidence to these tests.
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockSignedIn = true;
  pending = new Map();
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  mockDocument.read.mockResolvedValue({ pages: FINNAIR_RECEIPT, pageCount: FINNAIR_RECEIPT.length });
  jest.mocked(lookupFlight).mockImplementation(flight => new Promise((resolve, reject) => {
    pending.set(flight, { resolve, reject });
  }));
  jest.mocked(saveImportedJourney).mockResolvedValue({ id: 'saved', created: true });
});

afterEach(async () => {
  if (screen) await act(async () => screen!.unmount());
  screen = undefined;
  client.clear();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('waits for all five PDF trips, then saves them without any scrolling', async () => {
  await mount();
  expect(lookupFlight).toHaveBeenCalledTimes(5);
  await finish(0, 1, 2);
  expect(button().props.disabled).toBe(true);
  expect(button().props.label).toBe('Checking flights… 3 of 5');

  await finish(3, 4);
  expect(button().props.disabled).toBe(false);
  expect(button().props.label).toBe('Add 5 flights to My travels →');
  await pressAdd();
  expect(savedFlights()).toEqual(segments.map(segment => segment.flight));
});

it('guards the save handler against adding only the first three completed trips', async () => {
  await mount();
  await finish(0, 1, 2);
  // Exercise the handler too: UI disabling alone must not be the safeguard.
  await pressAdd();
  expect(saveImportedJourney).not.toHaveBeenCalled();
});

it('includes trips whose live lookup fails, using their printed PDF details', async () => {
  await mount();
  await finish(0, 1, 2);
  await act(async () => {
    pending.get(segments[3].flight!)!.reject(new FlightLookupError('No live record', 404));
    pending.get(segments[4].flight!)!.reject(new Error('Network unavailable'));
  });
  await flushQueries();
  expect(button().props.disabled).toBe(false);
  await pressAdd();
  expect(savedFlights()).toEqual(segments.map(segment => segment.flight));
  expect(jest.mocked(saveImportedJourney).mock.calls.map(([, row]) => row?.source))
    .toEqual(['lookup', 'lookup', 'lookup', 'manual', 'manual']);
});

it('saves all five trips while signed out, without waiting for disabled lookups', async () => {
  mockSignedIn = false;
  await mount();
  expect(lookupFlight).not.toHaveBeenCalled();
  expect(button().props.disabled).toBe(false);
  await pressAdd();
  expect(savedFlights()).toEqual(segments.map(segment => segment.flight));
});

it('preserves a traveller’s deselection while the other lookups finish', async () => {
  await mount();
  await finish(0, 1, 2);
  const firstCard = screen!.root.findAllByProps({ accessibilityRole: 'checkbox' })[0];
  act(() => firstCard.props.onPress());
  await finish(3, 4);
  expect(button().props.label).toBe('Add 4 flights to My travels →');
  await pressAdd();
  expect(savedFlights()).toEqual(segments.slice(1).map(segment => segment.flight));
});
