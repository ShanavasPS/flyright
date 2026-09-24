import { act, create } from 'react-test-renderer';
import { Alert } from 'react-native';
import { PrimaryButton } from './primary-button';
import { ThemedText } from './themed-text';
import { ProPlans } from './pro-plans';

const mockPurchase = jest.fn(), mockConfirm = jest.fn(), mockClose = jest.fn(), mockUnlock = jest.fn();
const mockReplace = jest.fn(), mockRestore = jest.fn();
let mockUserId: string | null = 'traveller';
let mockBillingUser = 'traveller';
let mockEligible: Record<string, boolean> = {};
let mockParams: { journeyId: string; next: string; packageId?: string } = { journeyId: 'trip-a', next: '/claim-wizard?journeyId=trip-a' };
jest.mock('@clerk/expo', () => ({ useAuth: () => ({ userId: mockUserId }), useUser: () => ({ user: null }) }));
jest.mock('@/components/sheen-card', () => ({ IconBadge: () => null }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ replace: mockReplace }) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('@/services/pro-access', () => ({ confirmServerPro: () => mockConfirm() }));
jest.mock('@/services/purchases', () => ({
  getCurrentOffering: async () => ({ availablePackages: [
    { identifier: 'monthly', packageType: 'MONTHLY', product: { identifier: 'flyright_pro_monthly', priceString: '₹499.00', subscriptionPeriod: 'P1M', introPrice: { price: 0, priceString: '₹0.00', cycles: 1, period: 'P2W', periodUnit: 'WEEK', periodNumberOfUnits: 2 } } },
    { identifier: 'annual', packageType: 'ANNUAL', product: { priceString: '₹3999.00', subscriptionPeriod: 'P1Y' } },
  ] }),
  introEligibility: async () => mockEligible,
  logInPurchases: jest.fn(), getAppUserId: async () => mockBillingUser,
  purchase: (...args: unknown[]) => mockPurchase(...args), restorePurchases: () => mockRestore(),
  entitledToPro: (info: { active?: boolean }) => !!info.active,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
let screen: ReturnType<typeof create>;
beforeEach(() => { jest.clearAllMocks(); mockUserId = 'traveller'; mockBillingUser = 'traveller'; mockEligible = {}; mockParams = { journeyId: 'trip-a', next: '/claim-wizard?journeyId=trip-a' }; mockConfirm.mockResolvedValue(true); mockRestore.mockResolvedValue(false); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(async () => { if (screen) await act(async () => screen.unmount()); jest.restoreAllMocks(); });
const buy = async () => {
  await act(async () => { screen = create(<ProPlans onClose={mockClose} onUnlocked={mockUnlock} />); });
  const button = screen.root.findAllByType(PrimaryButton).find(n => n.props.label === 'Continue · ₹499.00 / month')!;
  await act(async () => { button.props.onPress(); });
};

it.each(['purchase', 'restore'])('asks a guest to sign in before %s, retaining the selected trip and destination', async action => {
  mockUserId = null;
  if (action === 'purchase') await buy();
  else {
    await act(async () => { screen = create(<ProPlans onClose={mockClose} onUnlocked={mockUnlock} />); });
    const restore = screen.root.findAll(n => typeof n.props.onPress === 'function').find(n => n.findAllByType(ThemedText).some(t => t.props.children === 'Restore purchases'))!;
    await act(async () => restore.props.onPress());
  }
  const target = mockReplace.mock.calls[0][0];
  expect(target.pathname).toBe('/sign-in');
  const url = new URL(target.params.next, 'https://getflyright.com');
  expect(url.pathname).toBe('/paywall');
  expect(url.searchParams.get('journeyId')).toBe('trip-a');
  expect(url.searchParams.get('next')).toBe('/claim-wizard?journeyId=trip-a');
  expect(mockPurchase).not.toHaveBeenCalled();
  expect(mockRestore).not.toHaveBeenCalled();
  expect(mockUnlock).not.toHaveBeenCalled();
  mockUserId = 'traveller';
  await act(async () => screen.update(<ProPlans onClose={mockClose} onUnlocked={mockUnlock} />));
  expect(mockPurchase).not.toHaveBeenCalled(); // Signing in itself is never consent to pay.
  expect(mockRestore).not.toHaveBeenCalled();
});

it('does not charge when billing identity could not switch to the signed-in account', async () => {
  mockBillingUser = 'previous-account';
  await buy();
  expect(mockPurchase).not.toHaveBeenCalled();
  expect(mockUnlock).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith('Sign-in not ready', expect.any(String));
});

it.each([null, 'traveller'])('retains the yearly choice when the account screen returns (user=%s), without purchasing', async userId => {
  mockUserId = null;
  await act(async () => { screen = create(<ProPlans onClose={mockClose} onUnlocked={mockUnlock} />); });
  const yearly = screen.root.findAll(n => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function').find(n => n.props.accessibilityLabel.startsWith('Yearly,'))!;
  await act(async () => yearly.props.onPress());
  const next = screen.root.findAllByType(PrimaryButton).find(n => n.props.label === 'Continue · ₹3999.00 / year')!;
  await act(async () => next.props.onPress());
  const url = new URL(mockReplace.mock.calls[0][0].params.next, 'https://getflyright.com');
  expect(url.searchParams.get('packageId')).toBe('annual');
  await act(async () => screen.unmount());
  mockUserId = userId;
  mockParams = { ...mockParams, packageId: url.searchParams.get('packageId')! };
  await act(async () => { screen = create(<ProPlans onClose={mockClose} onUnlocked={mockUnlock} />); });
  expect(screen.root.findAllByType(PrimaryButton).map(n => n.props.label)).toContain('Continue · ₹3999.00 / year');
  expect(mockPurchase).not.toHaveBeenCalled();
  expect(mockRestore).not.toHaveBeenCalled();
});

it('falls back to an available plan if the pre-sign-in package has been removed', async () => {
  mockParams.packageId = 'retired-package';
  await act(async () => { screen = create(<ProPlans onClose={mockClose} onUnlocked={mockUnlock} />); });
  expect(screen.root.findAllByType(PrimaryButton).map(n => n.props.label)).toContain('Continue · ₹499.00 / month');
  expect(mockPurchase).not.toHaveBeenCalled();
});
it.each(['cancelled', 'pending'])('keeps the offer open without unlocking for a %s purchase', async status => {
  mockPurchase.mockResolvedValue(status === 'cancelled' ? { status } : { status: 'purchased', customerInfo: { active: false } });
  await buy();
  expect(mockPurchase).toHaveBeenCalledTimes(1);
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockUnlock).not.toHaveBeenCalled();
  expect(mockClose).not.toHaveBeenCalled();
});
it('reconciles an active purchase then returns to the caller once', async () => {
  mockPurchase.mockResolvedValue({ status: 'purchased', customerInfo: { active: true } });
  await buy();
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(mockUnlock).toHaveBeenCalledTimes(1);
  expect(mockClose).not.toHaveBeenCalled();
});

it('offers the store trial only to an account the store says is eligible', async () => {
  await act(async () => { screen = create(<ProPlans onClose={mockClose} onUnlocked={mockUnlock} />); });
  const labels = () => screen.root.findAllByType(PrimaryButton).map(n => n.props.label);
  expect(labels()).toContain('Continue · ₹499.00 / month'); // ineligible or unknown: the plain price
  mockEligible = { flyright_pro_monthly: true };
  await act(async () => screen.unmount());
  await act(async () => { screen = create(<ProPlans onClose={mockClose} onUnlocked={mockUnlock} />); });
  expect(labels()).toContain('Start 14 days free');
  expect(screen.root.findAllByType(ThemedText).some(t => t.props.children === '14 days free')).toBe(true);
});
