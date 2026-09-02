import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  REFUND_REQUEST_STATUS,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesOffering,
  type PurchasesPackage,
  type PurchasesStoreTransaction,
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { create } from 'zustand';

import {
  connectPurchasesAnalytics,
  setAnalyticsUserProperties,
  trackPurchaseCompleted,
} from '@/services/analytics';
import {
  IS_GALAXY_BUILD,
  RC_API_KEY_ANDROID,
  RC_API_KEY_IOS,
  RC_API_KEY_TEST,
} from '@/constants/config';

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

/** Offering shown when an existing subscriber changes plan: same packages as
 * the default offering, but its paywall speaks to a current customer
 * ("Switch plan") instead of pitching an unlock. */
export const OFFERING_CHANGE_PLAN = 'change-plan';

let configured = false;

/** Reactive customer state — kept in sync by the SDK's update listener. */
const usePurchasesStore = create<{ customerInfo: CustomerInfo | null }>(() => ({
  customerInfo: null,
}));

/** Whether a CustomerInfo carries the active 'FlyRight Pro' entitlement —
 * for synchronous checks on SDK callback payloads (prefer useHasPro in UI). */
export const entitledToPro = (info: CustomerInfo | null) =>
  info != null && ENTITLEMENT_PRO in info.entitlements.active;

/** Latest CustomerInfo, updated live on purchases/renewals/restores. */
export const useCustomerInfo = () => usePurchasesStore((s) => s.customerInfo);

/** Reactive 'FlyRight Pro' entitlement check — use this to gate UI. */
export const useHasPro = () => usePurchasesStore((s) => entitledToPro(s.customerInfo));

/** Active 'FlyRight Pro' entitlement details (product, renewal state), or null. */
export const useProEntitlement = () =>
  usePurchasesStore((s) => s.customerInfo?.entitlements.active[ENTITLEMENT_PRO] ?? null);

const NO_SUBSCRIPTIONS: string[] = [];

// Analytics user property: 'free' or the Pro product granting the entitlement
// (monthly / yearly / lifetime). Derived from every store update so it tracks
// purchases, renewals, restores and account switches alike; re-sent only when
// it actually changes.
let lastReportedTier: string | null = null;
usePurchasesStore.subscribe(({ customerInfo }) => {
  if (!customerInfo) return;
  const tier = customerInfo.entitlements.active[ENTITLEMENT_PRO]?.productIdentifier ?? 'free';
  if (tier === lastReportedTier) return;
  lastReportedTier = tier;
  setAnalyticsUserProperties({ subscription_tier: tier });
});

/**
 * Report a completed store purchase to analytics. The transaction knows the
 * product and its id but not the money, so price/currency come from the
 * package the buyer picked; the trial flag comes from the resulting
 * CustomerInfo, whose subscription record knows the period type (Android keys
 * it "product:basePlan", hence the prefix match). Both paywall surfaces call
 * this — the embedded RevenueCatUI paywall and purchase() below.
 */
export function reportPurchase(
  pkg: PurchasesPackage | null | undefined,
  transaction: PurchasesStoreTransaction | null | undefined,
  customerInfo: CustomerInfo,
): void {
  const productId = transaction?.productIdentifier || pkg?.product.identifier;
  if (!productId) return;
  const subscription = Object.entries(customerInfo.subscriptionsByProductIdentifier).find(
    ([key]) => key === productId || key.startsWith(`${productId}:`),
  )?.[1];
  const product = pkg?.product;
  trackPurchaseCompleted({
    productId,
    price: product?.price ?? 0,
    currency: product?.currencyCode ?? '',
    transactionId: transaction?.transactionIdentifier || undefined,
    period: product?.subscriptionPeriod ?? undefined,
    kind: subscription || product?.subscriptionPeriod ? 'subscription' : 'one_time',
    isTrial: subscription?.periodType === 'TRIAL',
  });
}

/**
 * Product ids of all active store subscriptions. More than one can be active
 * in the Test Store, where a plan change stacks instead of replacing (real
 * stores replace plans within a subscription group).
 */
export const useActiveSubscriptions = () =>
  usePurchasesStore((s) => s.customerInfo?.activeSubscriptions ?? NO_SUBSCRIPTIONS);

/**
 * Whether this binary can sell Pro at all. The Galaxy Store build can't:
 * RevenueCat has no Samsung IAP integration and Galaxy Store policy expects
 * Samsung IAP for digital goods — so that build hides all upsell UI and
 * leaves claims un-gated instead of dead-ending users on a paywall.
 */
export const billingAvailable = !IS_GALAXY_BUILD;

export function initPurchases() {
  if (Platform.OS === 'web') return; // web build is informational; no billing
  if (!billingAvailable) return; // Galaxy Store build ships without billing
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
  // Layers watches the same stream: a newly appearing subscription becomes a
  // subscription_start analytics event on the attributed install. Duck-typed
  // bridge so react-native-purchases stays behind this module's boundary
  // (Layers destructures { customerInfo } from getCustomerInfo's result).
  void connectPurchasesAnalytics({
    addCustomerInfoUpdateListener: (listener) =>
      Purchases.addCustomerInfoUpdateListener(listener),
    getCustomerInfo: async () => ({ customerInfo: await Purchases.getCustomerInfo() }),
  });
  // Prime the store from cache/network; the listener keeps it fresh afterwards.
  Purchases.getCustomerInfo()
    .then((customerInfo) => usePurchasesStore.setState({ customerInfo }))
    .catch((e) => console.warn('[purchases] initial getCustomerInfo failed', e));
}

export const isPurchasesConfigured = () => configured;

/**
 * Tie the RevenueCat identity to the signed-in Clerk user so purchases made on
 * any surface (native stores, web billing) land on the same customer. logIn
 * merges the device's anonymous purchase history into the account. The email
 * (once Clerk knows it) becomes the $email subscriber attribute — dashboard
 * lookup and support; the SDK skips the sync when the value is unchanged.
 */
export async function logInPurchases(userId: string, email?: string) {
  if (!configured) return;
  try {
    if ((await Purchases.getAppUserID()) !== userId) {
      const { customerInfo } = await Purchases.logIn(userId);
      usePurchasesStore.setState({ customerInfo });
    }
    if (email) await Purchases.setEmail(email);
  } catch (e) {
    console.warn('[purchases] logIn failed', e);
  }
}

/** Back to a fresh anonymous RevenueCat user after Clerk sign-out. */
export async function logOutPurchases() {
  if (!configured) return;
  try {
    if (await Purchases.isAnonymous()) return; // logOut throws if already anonymous
    const customerInfo = await Purchases.logOut();
    usePurchasesStore.setState({ customerInfo });
  } catch (e) {
    console.warn('[purchases] logOut failed', e);
  }
}

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

/** A specific offering by identifier (e.g. OFFERING_CHANGE_PLAN), or null when
 * it doesn't exist or the SDK isn't configured — callers fall back to the
 * default offering's paywall. */
export async function getOfferingByIdentifier(
  identifier: string,
): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.all[identifier] ?? null;
  } catch (e) {
    console.warn('[purchases] getOfferings failed', e);
    return null;
  }
}

export type PurchaseOutcome =
  | { status: 'purchased'; customerInfo: CustomerInfo }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/** Purchase a package from an offering; never throws. */
export async function purchase(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  if (!configured) return { status: 'error', message: 'Purchases not configured' };
  try {
    const { customerInfo, transaction } = await Purchases.purchasePackage(pkg);
    usePurchasesStore.setState({ customerInfo });
    reportPurchase(pkg, transaction, customerInfo);
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

export type RefundRequestOutcome = 'submitted' | 'cancelled' | 'unavailable';

/** StoreKit's refund sheet for the active entitlement — iOS only; Android
 * refunds go through Google Play support instead. */
export async function beginRefundRequest(): Promise<RefundRequestOutcome> {
  if (!configured || Platform.OS !== 'ios') return 'unavailable';
  try {
    const status = await Purchases.beginRefundRequestForActiveEntitlement();
    if (status === REFUND_REQUEST_STATUS.SUCCESS) return 'submitted';
    if (status === REFUND_REQUEST_STATUS.USER_CANCELLED) return 'cancelled';
    return 'unavailable';
  } catch (e) {
    console.warn('[purchases] refund request failed', e);
    return 'unavailable';
  }
}

/** Current RevenueCat app user id — shown so support can find the customer. */
export async function getAppUserId(): Promise<string | null> {
  if (!configured) return null;
  try {
    return await Purchases.getAppUserID();
  } catch {
    return null;
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
