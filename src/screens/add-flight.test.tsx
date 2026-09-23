import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create } from 'react-test-renderer';
import { Alert } from 'react-native';

import { PassAction } from '@/components/pass-card';
import { BoardingPassScanner } from '@/components/boarding-pass-scanner';
import { CODESHARE_PASS, CODESHARE_TRIP } from '@/services/__fixtures__/codeshare';
import { parseBcbp } from '@/services/bcbp';
import { FlightLookupError, lookupFlight, type FlightStatus } from '@/services/flight-lookup';
import { useAddFlightDraft } from '@/services/add-flight-draft';
import { addJourney, saveImportedJourney, type JourneyRow } from '@/services/journeys';
import { AddFlight } from './add-flight';

let mockSignedIn = false;
let mockAuthLoaded = true;
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: { scan?: string } = {};
let mockJourneys: JourneyRow[] | undefined = [];
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ userId: mockSignedIn ? 'traveller' : null, isSignedIn: mockSignedIn, isLoaded: mockAuthLoaded }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: jest.fn(),
}));
jest.mock('@/services/flight-lookup', () => ({
  ...jest.requireActual('@/services/flight-lookup'), lookupFlight: jest.fn(),
}));
jest.mock('@/services/journeys', () => ({ useJourney: () => ({ row: null, loaded: true }), useJourneys: () => ({ data: mockJourneys }), addJourney: jest.fn(), saveImportedJourney: jest.fn() }));
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
  mockParams = {};
  mockJourneys = [];
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  useAddFlightDraft.getState().reset({ flightNumber: 'AY1331', flightInput: 'AY1331', date: '2026-09-14' });
  jest.mocked(lookupFlight).mockReset().mockResolvedValue(flight);
});
afterEach(async () => {
  if (screen) await act(async () => screen!.unmount());
  screen = undefined;
  client.clear();
  jest.restoreAllMocks();
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

describe('scanning a codeshare boarding pass', () => {
  async function scan() {
    jest.setSystemTime(new Date('2026-07-25T12:00:00Z'));
    mockSignedIn = true;
    mockParams = { scan: '1' };
    await act(async () => {
      screen = create(<QueryClientProvider client={client}><AddFlight step="flight" /></QueryClientProvider>);
    });
    await act(async () => {
      await screen!.root.findByType(BoardingPassScanner).props.onScan(parseBcbp(CODESHARE_PASS), { code: CODESHARE_PASS, format: 'pdf417' });
    });
  }

  function answer(label: string) {
    return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const button = buttons?.find(button => button.text === label);
      if (!button) throw new Error(`Missing confirmation action: ${label}`);
      button.onPress?.();
    });
  }

  it('updates the Qatar leg when the booking matches instead of starting a new flight', async () => {
    mockJourneys = [{ ...CODESHARE_TRIP, bookingReference: 'ASPNR1' }];
    const alert = jest.spyOn(Alert, 'alert');
    await scan();
    expect(alert).not.toHaveBeenCalled();
    expect(saveImportedJourney).toHaveBeenCalledWith(expect.objectContaining({ flight: 'AS686', seat: '2A' }), null, 'traveller', 'qatar-leg');
    expect(addJourney).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ title: 'Boarding pass updated' }) }));
  });

  it('confirms the existing leg when the partner booking differs', async () => {
    mockJourneys = [CODESHARE_TRIP];
    const alert = answer('Update existing');
    await scan();
    expect(alert).toHaveBeenCalledWith('Is this the same flight?', expect.stringMatching(/AS686.*SEA → PDX.*QR3387/s), expect.any(Array), expect.any(Object));
    expect(saveImportedJourney).toHaveBeenCalledWith(expect.objectContaining({ flight: 'AS686' }), null, 'traveller', 'qatar-leg');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('lets a genuinely different flight proceed separately without changing the old trip', async () => {
    mockJourneys = [CODESHARE_TRIP];
    answer('Add separately');
    await scan();
    expect(saveImportedJourney).not.toHaveBeenCalled();
    expect(useAddFlightDraft.getState()).toMatchObject({ flightNumber: 'AS686', date: '2026-07-25', fromInput: 'SEA', toInput: 'PDX' });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/add-result', params: {} });
  });

  it('leaves both trips untouched when the traveller cancels', async () => {
    mockJourneys = [CODESHARE_TRIP];
    answer('Cancel');
    await scan();
    expect(saveImportedJourney).not.toHaveBeenCalled();
    expect(addJourney).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('lets the traveller choose between two possible existing flights', async () => {
    mockJourneys = [CODESHARE_TRIP, { ...CODESHARE_TRIP, id: 'later-leg', number: 'QR3389', scheduledDeparture: '2026-07-26T01:00:00Z' }];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, message, buttons) => {
      const label = message?.includes('QR3387') ? 'Check next flight' : 'Update existing';
      buttons?.find(button => button.text === label)?.onPress?.();
    });
    await scan();
    expect(alert).toHaveBeenCalledTimes(2);
    expect(saveImportedJourney).toHaveBeenCalledWith(expect.objectContaining({ flight: 'AS686' }), null, 'traveller', 'later-leg');
  });

  it('treats dismissing the confirmation as cancellation', async () => {
    mockJourneys = [CODESHARE_TRIP];
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, _buttons, options) => options?.onDismiss?.());
    await scan();
    expect(saveImportedJourney).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('waits for the journal before deciding a scanned flight is new', async () => {
    mockJourneys = undefined;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await scan();
    expect(alert).toHaveBeenCalledWith('Your trips are still loading', expect.any(String), expect.any(Array));
    expect(saveImportedJourney).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
