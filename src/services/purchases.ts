import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { create } from 'zustand';

import { RC_API_KEY_ANDROID, RC_API_KEY_IOS, RC_API_KEY_TEST } from '@/constants/config';

/**
 * Single boundary for all RevenueCat access. Nothing else in the app imports
 * react-native-purchases directly.
 *
 * Entitlements:
 *  - 'Owed Pro' (displayed as "FlyRight Pro") → Pro subscription/lifetime
 *    (unlimited claims, deadline tracking). The lookup key kept the app's old
 *    name because RevenueCat entitlement identifiers are immutable.
 * Products (attached to 'Owed Pro' in the dashboard): monthly, yearly, lifetime.
 * Non-subscription (planned):
 *  - 'claim_credit' → consumable, unlocks a single claim packet
 */
export const ENTITLEMENT_PRO = 'Owed Pro';

/** Custom action id configured on the Customer Center's management screen. */
export const CC_ACTION_CHANGE_PLAN = 'change_plan';

let configured = false;

/** Reactive customer state — kept in sync by the SDK's update listener. */
const usePurchasesStore = create<{ customerInfo: CustomerInfo | null }>(() => ({
  customerInfo: null,
}));

const entitledToPro = (info: CustomerInfo | null) =>
  info != null && ENTITLEMENT_PRO in info.entitlements.active;

/** Latest CustomerInfo, updated live on purchases/renewals/restores. */
export const useCustomerInfo = () => usePurchasesStore((s) => s.customerInfo);

/** Reactive 'FlyRight Pro' entitlement check — use this to gate UI. */
export const useHasPro = () => usePurchasesStore((s) => entitledToPro(s.customerInfo));

/** Active 'FlyRight Pro' entitlement details (product, renewal state), or null. */
export const useProEntitlement = () =>
  usePurchasesStore((s) => s.customerInfo?.entitlements.active[ENTITLEMENT_PRO] ?? null);

const NO_SUBSCRIPTIONS: string[] = [];

/**
 * Product ids of all active store subscriptions. More than one can be active
 * in the Test Store, where a plan change stacks instead of replacing (real
 * stores replace plans within a subscription group).
 */
export const useActiveSubscriptions = () =>
  usePurchasesStore((s) => s.customerInfo?.activeSubscriptions ?? NO_SUBSCRIPTIONS);

export function initPurchases() {
  if (Platform.OS === 'web') return; // web build is informational; no billing
  const platformKey = Platform.select({ ios: RC_API_KEY_IOS, android: RC_API_KEY_ANDROID });
  // The Test Store fallback is dev-only; a release build must ship platform keys.
  const apiKey = platformKey || (__DEV__ ? RC_API_KEY_TEST : '');
  if (!apiKey) {
    (__DEV__ ? console.warn : console.error)(
      '[purchases] no RevenueCat key set for this platform — purchases disabled',
    );
    return;
  }
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
  configured = true;

  Purchases.addCustomerInfoUpdateListener((customerInfo) => {
    usePurchasesStore.setState({ customerInfo });
  });
  // Prime the store from cache/network; the listener keeps it fresh afterwards.
  Purchases.getCustomerInfo()
    .then((customerInfo) => usePurchasesStore.setState({ customerInfo }))
    .catch((e) => console.warn('[purchases] initial getCustomerInfo failed', e));
}

export const isPurchasesConfigured = () => configured;

/** Imperative entitlement check (prefer useHasPro in components). */
export async function hasPro(): Promise<boolean> {
  if (!configured) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    usePurchasesStore.setState({ customerInfo: info });
    return entitledToPro(info);
  } catch (e) {
    console.warn('[purchases] getCustomerInfo failed', e);
    return entitledToPro(usePurchasesStore.getState().customerInfo); // fall back to cache
  }
}

/** Current offering (packages: $rc_monthly, $rc_annual, $rc_lifetime) for custom UI. */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export type PurchaseOutcome =
  | { status: 'purchased'; customerInfo: CustomerInfo }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/** Purchase a package from an offering; never throws. */
export async function purchase(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  if (!configured) return { status: 'error', message: 'Purchases not configured' };
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    usePurchasesStore.setState({ customerInfo });
    return { status: 'purchased', customerInfo };
  } catch (e) {
    const err = e as PurchasesError;
    if (err.userCancelled) return { status: 'cancelled' };
    console.warn('[purchases] purchase failed', err.code, err.message);
    return { status: 'error', message: err.message ?? 'Purchase failed' };
  }
}

/**
 * Present the current offering's paywall (remote-configured in the RevenueCat
 * dashboard — Paywalls v2) unless already entitled. Returns true if the user
 * ends up entitled to 'FlyRight Pro'.
 */
export async function presentProPaywall(): Promise<boolean> {
  if (!configured) return false;
  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: ENTITLEMENT_PRO,
    });
    switch (result) {
      case PAYWALL_RESULT.NOT_PRESENTED: // already entitled
      case PAYWALL_RESULT.PURCHASED:
      case PAYWALL_RESULT.RESTORED:
        return hasPro();
      default:
        return false;
    }
  } catch (e) {
    console.warn('[purchases] paywall failed', e);
    return false;
  }
}

/** Restore prior purchases; returns whether 'FlyRight Pro' is now active. */
export async function restorePurchases(): Promise<boolean> {
  if (!configured) return false;
  try {
    const customerInfo = await Purchases.restorePurchases();
    usePurchasesStore.setState({ customerInfo });
    return entitledToPro(customerInfo);
  } catch (e) {
    console.warn('[purchases] restore failed', e);
    return false;
  }
}
