import { act, create } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ProTripCard } from '@/components/pro-trip-card';
import type { JourneyRow } from '@/services/journeys';
import { ProOffer } from './pro-offer';

const mockPush = jest.fn(), mockReplace = jest.fn(), mockBack = jest.fn(), mockSave = jest.fn(), mockDismiss = jest.fn();
let mockPro = false;
let mockUserId: string | null = 'traveller';
let mockNow = '2026-09-23T10:00:00Z';
let mockParams: { journeyId?: string; next?: string; feature?: string; step?: string } = { journeyId: 'trip-a' };
const mockTrip = { id: 'trip-a', userId: 'traveller', syncedAt: '2026-09-23T10:00:00Z', number: 'AY1', fromCode: 'HEL', toCode: 'LHR', scheduledDeparture: '2026-10-04T10:00:00Z', scheduledArrival: '2026-10-04T13:00:00Z' } as JourneyRow;
let mockPreferences = { introductionSeen: true, homeDismissed: false, loaded: true, remoteLoaded: true, reminders: [] };
jest.mock('@clerk/expo', () => ({ useAuth: () => ({ userId: mockUserId }) }));
jest.mock('@/components/sheen-card', () => ({ IconBadge: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams, useFocusEffect: jest.fn(),
}));
jest.mock('convex/react', () => ({ useMutation: () => mockSave }));
jest.mock('@/constants/config', () => ({ CONVEX_URL: 'https://example.convex.cloud' }));
jest.mock('@/hooks/use-now', () => ({ useNow: () => new Date(mockNow) }));
jest.mock('@/services/journeys', () => ({ useJourneys: () => ({ data: [mockTrip] }) }));
jest.mock('@/services/purchases', () => ({ useHasPro: () => mockPro, useProReady: () => true, billingAvailable: true }));
jest.mock('@/services/pro-prompts', () => ({ useProPreferences: () => mockPreferences, markProIntroductionSeen: jest.fn(), dismissHomeProCard: (...args: unknown[]) => mockDismiss(...args) }));
jest.mock('@/services/flash', () => ({ showFlash: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

let screen: ReturnType<typeof create>;
const labels = () => screen.root.findAllByType(ThemedText).map(n => n.props.children);
const press = async (text: string) => {
  const button = screen.root.findAll(n => typeof n.props.onPress === 'function').find(n => n.findAllByType(ThemedText).some(t => t.props.children === text));
  expect(button).toBeDefined();
  await act(async () => { await button!.props.onPress(); });
};
beforeEach(() => {
  jest.clearAllMocks(); mockPro = false; mockParams = { journeyId: 'trip-a' };
  mockUserId = 'traveller'; mockTrip.userId = 'traveller'; mockTrip.syncedAt = '2026-09-23T10:00:00Z';
  mockNow = '2026-09-23T10:00:00Z';
  mockPreferences = { introductionSeen: true, homeDismissed: false, loaded: true, remoteLoaded: true, reminders: [] };
  mockSave.mockResolvedValue(undefined);
});
afterEach(async () => { if (screen) await act(async () => screen.unmount()); });

it('asks for reminder consent separately from the offer and never enters checkout when confirming', async () => {
  await act(async () => { screen = create(<ProOffer />); });
  expect(labels()).toContain('Remind me 2 days before this trip');
  expect(mockSave).not.toHaveBeenCalled();
  await press('Remind me 2 days before this trip');
  expect(labels()).toContain('Remind me before take-off');
  expect(mockSave).not.toHaveBeenCalled();
  const confirm = screen.root.findAllByType(PrimaryButton).find(n => n.props.label === 'Set reminder')!;
  await act(async () => { await confirm.props.onPress(); });
  expect(mockSave).toHaveBeenCalledWith({ userId: 'traveller', journeyKey: 'trip-a', action: 'set' });
  expect(mockPush).not.toHaveBeenCalled(); expect(mockReplace).not.toHaveBeenCalled();
  expect(mockBack).toHaveBeenCalledTimes(1);
});
it('continues free without recording reminder consent and leaves a clear gap before that action', async () => {
  await act(async () => { screen = create(<ProOffer />); });
  const continueFree = screen.root.findAll(n => n.props.testID === 'pro-continue-free' && typeof n.props.onPress === 'function')[0];
  expect(StyleSheet.flatten(continueFree.props.style({ pressed: false })).marginTop).toBe(8); // plus the 16pt content gap
  await press('Continue free');
  expect(mockSave).not.toHaveBeenCalled(); expect(mockBack).toHaveBeenCalledTimes(1);
});
it('suppresses acquisition and reminders while Pro is active', async () => {
  mockPro = true;
  await act(async () => { screen = create(<ProOffer />); });
  expect(labels()).not.toContain('Remind me 2 days before this trip');
  expect(screen.root.findAllByType(PrimaryButton).map(n => n.props.label)).toEqual(['Back to my trip']);
});
it('lets a guest browse plans with their trip and destination, or continue free without signing in', async () => {
  mockUserId = null;
  mockParams = { journeyId: 'trip-a', feature: 'claim', next: '/claim-wizard?journeyId=trip-a' };
  await act(async () => { screen = create(<ProOffer />); });
  const plans = screen.root.findAllByType(PrimaryButton).find(n => n.props.label === 'See plans')!;
  await act(async () => plans.props.onPress());
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/paywall', params: mockParams });
  await press('Continue free');
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(mockSave).not.toHaveBeenCalled();
});
it('asks a guest to sign in for a reminder, preserving the trip without saving anything on cancellation', async () => {
  mockUserId = null;
  await act(async () => { screen = create(<ProOffer />); });
  await press('Remind me 2 days before this trip');
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/sign-in', params: { next: '/pro-offer?journeyId=trip-a&step=reminder' } });
  await act(async () => screen.unmount());
  mockParams = { journeyId: 'trip-a', step: 'reminder' };
  await act(async () => { screen = create(<ProOffer />); });
  expect(labels()).toContain('What Pro adds');
  expect(labels()).not.toContain('Remind me before take-off');
  expect(mockSave).not.toHaveBeenCalled();
  await press('Continue free');
  expect(mockBack).toHaveBeenCalledTimes(1);
});
it('waits for a newly signed-in guest flight to sync, then still requires explicit reminder consent', async () => {
  mockParams = { journeyId: 'trip-a', step: 'reminder' };
  mockTrip.userId = null; mockTrip.syncedAt = null;
  await act(async () => { screen = create(<ProOffer />); });
  const confirm = () => screen.root.findAllByType(PrimaryButton).find(n => n.props.label === 'Set reminder')!;
  expect(confirm().props.disabled).toBe(true);
  mockTrip.userId = 'traveller'; mockTrip.syncedAt = '2026-09-23T10:00:00Z';
  await act(async () => screen.update(<ProOffer />));
  expect(confirm().props.disabled).toBe(false);
  expect(mockSave).not.toHaveBeenCalled();
  await act(async () => { await confirm().props.onPress(); });
  expect(mockSave).toHaveBeenCalledWith({ userId: 'traveller', journeyKey: 'trip-a', action: 'set' });
});
it('keeps the trip entry after home dismissal, without a close control or repeated introduction', async () => {
  mockPreferences.homeDismissed = true;
  await act(async () => { screen = create(<ProTripCard trip={mockTrip} home />); });
  expect(screen.toJSON()).toBeNull();
  await act(async () => { screen.update(<ProTripCard trip={mockTrip} />); });
  expect(labels()).toContain('Live updates off');
  expect(labels()).toContain('For this trip');
  expect(screen.root.findAllByProps({ testID: 'pro-home-dismiss' })).toHaveLength(0);
  expect(labels()).not.toContain('Extra help when you travel.');
});
it('the compact home close only records permanent home dismissal', async () => {
  await act(async () => { screen = create(<ProTripCard trip={mockTrip} home />); });
  const close = screen.root.findAll(n => n.props.testID === 'pro-home-dismiss' && typeof n.props.onPress === 'function')[0];
  await act(async () => { close.props.onPress(); });
  expect(mockDismiss).toHaveBeenCalledWith('traveller');
  expect(mockSave).not.toHaveBeenCalled(); expect(mockPush).not.toHaveBeenCalled();
});

it.each([true, false])('hides the card at departure and for past trips (home=%s)', async home => {
  await act(async () => { screen = create(<ProTripCard trip={mockTrip} home={home} />); });
  expect(labels()).toContain('Live updates off');
  mockNow = mockTrip.scheduledDeparture;
  await act(async () => { screen.update(<ProTripCard trip={mockTrip} home={home} />); });
  expect(screen.toJSON()).toBeNull();
  mockNow = '2026-10-05T10:00:00Z';
  await act(async () => { screen.update(<ProTripCard trip={mockTrip} home={home} />); });
  expect(screen.toJSON()).toBeNull();
});
