import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create } from 'react-test-renderer';
import { Alert } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { FINNAIR_RECEIPT } from '@/services/__fixtures__/itinerary-documents';
import { CODESHARE_PASS, CODESHARE_TRIP } from '@/services/__fixtures__/codeshare';
import { FlightLookupError, lookupFlight, type FlightStatus } from '@/services/flight-lookup';
import { extractItinerary } from '@/services/itinerary';
import { legSchedule } from '@/services/leg-schedule';
import { saveImportedJourney, type JourneyRow } from '@/services/journeys';
import { serializeBaggage } from '@/services/baggage';
import { keepDocument } from '@/services/trip-documents';
import { ThemedSwitch } from '@/components/themed-switch';
import { ImportDocument } from './import-document';

const mockDocument = {
  kind: 'pdf',
  name: 'five-flights.pdf',
  read: jest.fn(),
  keep: jest.fn(() => ({ uri: 'file:///cache/document-imports/handle', name: 'five-flights.pdf' })),
  retain: jest.fn(),
  release: jest.fn(),
};
let mockSignedIn = true;
let mockJourneys: JourneyRow[] = [];
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ userId: mockSignedIn ? 'traveller' : null, isSignedIn: mockSignedIn, isLoaded: true }),
}));
jest.mock('@/services/document-imports', () => ({ importDocument: () => mockDocument }));
jest.mock('@/services/flight-lookup', () => ({
  ...jest.requireActual('@/services/flight-lookup'),
  lookupFlight: jest.fn(),
}));
jest.mock('@/services/journeys', () => ({
  useJourneys: () => ({ data: mockJourneys }),
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
jest.mock('@/services/trip-documents', () => ({ keepDocument: jest.fn().mockResolvedValue(1) }));
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
  mockJourneys = [];
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
  expect(button().props.label).toBe('Add 5 flights →');
  await pressAdd();
  expect(savedFlights()).toEqual(segments.map(segment => segment.flight));
});

describe('keeping the document with the trips', () => {
  const addAll = async () => {
    await mount();
    await finish(0, 1, 2, 3, 4);
    jest.mocked(saveImportedJourney).mockImplementation(async (segment) => ({ id: `trip-${segment.flight}`, created: true }));
  };

  it('keeps the PDF with every trip it made', async () => {
    await addAll();
    await pressAdd();
    expect(keepDocument).toHaveBeenCalledWith(
      segments.map((segment) => `trip-${segment.flight}`),
      'traveller',
      { uri: 'file:///cache/document-imports/handle', name: 'five-flights.pdf' },
      expect.objectContaining({ flight: segments[0]!.flight, date: segments[0]!.date }),
    );
  });

  it('keeps nothing when the traveller turns it off', async () => {
    await addAll();
    await act(async () => screen!.root.findByType(ThemedSwitch).props.onValueChange(false));
    await pressAdd();
    expect(saveImportedJourney).toHaveBeenCalledTimes(5);
    expect(keepDocument).not.toHaveBeenCalled();
  });

  it('still saves the trips when the document cannot be kept', async () => {
    jest.mocked(keepDocument).mockRejectedValueOnce(new Error('disk full'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await addAll();
    await pressAdd();
    expect(saveImportedJourney).toHaveBeenCalledTimes(5);
    expect(alert).not.toHaveBeenCalled();
  });

  /** The document's legs as trips already in Flights, every detail the
   * document carries already on them — nothing left for this import to add. */
  const alreadyInFlights = (indices: number[]): JourneyRow[] =>
    indices.map((i) => {
      const segment = segments[i]!;
      const schedule = legSchedule(segment, null);
      return {
        id: `trip-${segment.flight}`, mode: 'flight', number: segment.flight,
        fromCode: segment.fromCode, toCode: segment.toCode,
        scheduledDeparture: schedule.departure, scheduledArrival: schedule.arrival,
        seat: segment.seat, cabin: segment.cabin ?? null, baggage: serializeBaggage(segment.baggage), bookingReference: segment.pnr,
        passCode: segment.pass?.code ?? null, passFormat: segment.pass?.format ?? null,
        ticketCode: segment.ticket?.code ?? null, ticketFormat: segment.ticket?.format ?? null,
        deletedAt: null,
      } as unknown as JourneyRow;
    });

  it('keeps the document on the trips when every flight is already in Flights', async () => {
    mockJourneys = alreadyInFlights([0, 1, 2, 3, 4]);
    await mount();
    await finish(0, 1, 2, 3, 4);
    expect(button().props.label).toBe('Keep the document →');
    expect(button().props.disabled).toBe(false);
    jest.mocked(keepDocument).mockReturnValueOnce(new Promise(() => {}));
    act(() => { void button().props.onPress(); });
    expect(button().props.label).toBe('Keeping…');
    await act(async () => screen!.unmount());
    screen = undefined;
    jest.mocked(keepDocument).mockClear();
    await mount();
    await finish(0, 1, 2, 3, 4);
    await pressAdd();
    expect(saveImportedJourney).not.toHaveBeenCalled();
    expect(keepDocument).toHaveBeenCalledWith(
      segments.map((segment) => `trip-${segment.flight}`),
      'traveller',
      expect.objectContaining({ name: 'five-flights.pdf' }),
      expect.objectContaining({ flight: segments[0]!.flight }),
    );
  });

  it('has nothing to do there once the traveller turns keeping off', async () => {
    mockJourneys = alreadyInFlights([0, 1, 2, 3, 4]);
    await mount();
    await finish(0, 1, 2, 3, 4);
    await act(async () => screen!.root.findByType(ThemedSwitch).props.onValueChange(false));
    expect(button().props.label).toBe('Nothing selected');
    expect(button().props.disabled).toBe(true);
  });

  it('keeps it on the trips already there as well as the new ones', async () => {
    mockJourneys = alreadyInFlights([0, 1]);
    await mount();
    await finish(0, 1, 2, 3, 4);
    jest.mocked(saveImportedJourney).mockImplementation(async (segment) => ({ id: `trip-${segment.flight}`, created: true }));
    await pressAdd();
    expect(saveImportedJourney).toHaveBeenCalledTimes(3);
    expect(jest.mocked(keepDocument).mock.calls[0]![0].slice().sort()).toEqual(
      segments.map((segment) => `trip-${segment.flight}`).sort(),
    );
  });

  it('never shows a shared temporary copy\'s random name', async () => {
    const shared = 'FEE9FDFA-F789-4C8F-98B3-97F33CFEF471.pdf';
    mockDocument.name = shared;
    try {
      await mount();
      await finish(0, 1, 2, 3, 4);
      const texts = screen!.root.findAll((n) => typeof n.props.children === 'string' || Array.isArray(n.props.children));
      const shown = texts.map((n) => [n.props.children].flat().join('')).join(' ');
      expect(shown).toContain('flights in this document');
      expect(shown).not.toContain('FEE9FDFA');
    } finally {
      mockDocument.name = 'five-flights.pdf';
    }
  });

  it('lets go of the file when the screen closes', async () => {
    await mount();
    expect(mockDocument.retain).toHaveBeenCalled();
    await act(async () => screen!.unmount());
    screen = undefined;
    expect(mockDocument.release).toHaveBeenCalled();
  });
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

it('looks up and saves all five trips without an account', async () => {
  mockSignedIn = false;
  await mount();
  expect(lookupFlight).toHaveBeenCalledTimes(5);
  expect(button().props.disabled).toBe(true);
  await finish(0, 1, 2, 3, 4);
  expect(button().props.disabled).toBe(false);
  await pressAdd();
  expect(savedFlights()).toEqual(segments.map(segment => segment.flight));
  expect(jest.mocked(saveImportedJourney).mock.calls.map(([, row]) => row?.source))
    .toEqual(['lookup', 'lookup', 'lookup', 'lookup', 'lookup']);
});

it('preserves every imported flight when the guest allowance runs out mid-document', async () => {
  mockSignedIn = false;
  await mount();
  await finish(0, 1);
  await act(async () => {
    for (const index of [2, 3, 4]) {
      pending.get(segments[index].flight!)!.reject(
        new FlightLookupError('Guest allowance used up', 429, 'guest_quota_exceeded'),
      );
    }
  });
  await flushQueries();
  expect(JSON.stringify(screen!.toJSON())).toContain('Sign in to track them live');
  expect(button().props.disabled).toBe(false);
  await pressAdd();
  expect(savedFlights()).toEqual(segments.map(segment => segment.flight));
  expect(jest.mocked(saveImportedJourney).mock.calls.map(([, row]) => row?.source))
    .toEqual(['lookup', 'lookup', 'manual', 'manual', 'manual']);
});

it('preserves a traveller’s deselection while the other lookups finish', async () => {
  await mount();
  await finish(0, 1, 2);
  const firstCard = screen!.root.findAllByProps({ accessibilityRole: 'checkbox' })[0];
  act(() => firstCard.props.onPress());
  await finish(3, 4);
  expect(button().props.label).toBe('Add 4 flights →');
  await pressAdd();
  expect(savedFlights()).toEqual(segments.slice(1).map(segment => segment.flight));
});

describe('an operating boarding pass for an existing marketing flight', () => {
  async function mountPass() {
    mockDocument.read.mockResolvedValue({ pages: [{ text: '', barcodes: [CODESHARE_PASS], barcodeFormats: ['pdf417'] }], pageCount: 1 });
    await mount();
    await act(async () => pending.get('AS686')!.reject(new FlightLookupError('No live record', 404)));
    await flushQueries();
  }

  it('updates the selected original trip after confirming a different partner locator, even offline', async () => {
    mockJourneys = [CODESHARE_TRIP];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find(button => button.text === 'Update existing')?.onPress?.();
    });
    await mountPass();
    await pressAdd();
    expect(alert).toHaveBeenCalledWith('Is this the same flight?', expect.stringContaining('QR3387'), expect.any(Array), expect.any(Object));
    expect(saveImportedJourney).toHaveBeenCalledTimes(1);
    expect(saveImportedJourney).toHaveBeenCalledWith(expect.objectContaining({ flight: 'AS686', pnr: 'ASPNR1' }), null, 'traveller', 'qatar-leg');
  });

  it('returns to review without saving on cancellation', async () => {
    mockJourneys = [CODESHARE_TRIP];
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find(button => button.text === 'Cancel')?.onPress?.();
    });
    await mountPass();
    await pressAdd();
    expect(saveImportedJourney).not.toHaveBeenCalled();
    expect(button().props.disabled).toBe(false);
  });

  it('allows a separate flight after an explicit choice', async () => {
    mockJourneys = [CODESHARE_TRIP];
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find(button => button.text === 'Add separately')?.onPress?.();
    });
    await mountPass();
    await pressAdd();
    expect(saveImportedJourney).toHaveBeenCalledWith(expect.objectContaining({ flight: 'AS686' }), expect.objectContaining({ number: 'AS686' }), 'traveller');
  });

  it('recognises a confirmed operating number automatically on the next import', async () => {
    mockJourneys = [{ ...CODESHARE_TRIP, passCode: CODESHARE_PASS.replace('002A', '003B'), passFormat: 'pdf417' }];
    const alert = jest.spyOn(Alert, 'alert');
    await mountPass();
    await pressAdd();
    expect(alert).not.toHaveBeenCalled();
    expect(saveImportedJourney).toHaveBeenCalledWith(expect.objectContaining({ flight: 'AS686' }), null, 'traveller', undefined);
  });
});
