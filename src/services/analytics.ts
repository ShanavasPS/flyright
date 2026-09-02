import {
  connectRevenueCat,
  LayersReactNative,
  trackPurchase,
  useLayersExpoRouterTracking,
  type EventProperties,
  type RevenueCatCustomerInfo,
  type UserProperties,
} from '@layers/expo';
import { useGlobalSearchParams, usePathname } from 'expo-router';
import { Platform } from 'react-native';

import { LAYERS_APP_ID } from '@/constants/config';

/**
 * Single boundary for Layers (growth analytics + install attribution) —
 * nothing else imports @layers/expo directly. Native binaries only: the web
 * build resolves analytics.web.ts, so the funnel pages ship no Layers code.
 *
 * What flows through here:
 *  - lifecycle: `app_open`, `$first_open`, `$app_update`, background /
 *    foreground and `deep_link_opened` (UTM + click ids as flat properties)
 *    are all emitted by the SDK itself once init() runs — the deep-link
 *    listener rides react-native's Linking, i.e. the same flyright:// and
 *    getflyright.com URLs expo-router handles;
 *  - screens: `$screen_view` per route change (useAnalyticsScreenTracking);
 *  - identity: the Clerk user id, which is also the RevenueCat app_user_id,
 *    so Layers can join an install's attribution to the revenue it produced
 *    (logInAnalytics / trackAuth, driven by IdentitySync);
 *  - money: `purchase_success` / `trial_start` from the store transaction
 *    (trackPurchaseCompleted, via purchases.ts) and `subscription_start`
 *    bridged from RevenueCat's customer-info stream (connectPurchasesAnalytics);
 *  - activation: the hand-picked product events the screens fire through
 *    trackEvent (flight_added, verdict_shown, claim_sent, paywall_shown …).
 *
 * No EXPO_PUBLIC_LAYERS_APP_ID → sdk stays null and every export is a no-op,
 * the same disabled-by-absence contract as purchases and cloud sync.
 */

// Module scope (the Observe.configure precedent in _layout): the instance
// must exist before first render so screen tracking covers the launch screen.
// The constructor is synchronous; events tracked before init() are queued.
const sdk = LAYERS_APP_ID
  ? new LayersReactNative({
      appId: LAYERS_APP_ID,
      environment: __DEV__ ? 'development' : 'production',
      // Logs every queued event to the console in dev builds; silent in release.
      enableDebug: __DEV__,
    })
  : null;

let initPromise: Promise<void> | null = null;

/** Start the SDK (network + storage). Idempotent; never throws. */
export function initAnalytics(): Promise<void> {
  if (!sdk) return Promise.resolve();
  initPromise ??= sdk.init().catch((e) => {
    console.warn('[analytics] init failed', e);
  });
  return initPromise;
}

/** Fire-and-forget custom event. Safe before init and with the SDK disabled. */
export function trackEvent(name: string, properties?: EventProperties): void {
  try {
    sdk?.track(name, properties);
  } catch (e) {
    console.warn('[analytics] track failed', e);
  }
}

/** Mirror the Clerk session in (see IdentitySync). setAppUserId is set-once
 * until cleared, so clear first — this makes account switches stick. The
 * traits (auth method, sign-up date) become user properties; undefined
 * values are dropped so a not-yet-known field never overwrites a known one. */
export function logInAnalytics(userId: string, traits?: UserProperties): void {
  if (!sdk) return;
  try {
    sdk.clearAppUserId();
    sdk.setAppUserId(userId);
    if (traits) setAnalyticsUserProperties(traits);
  } catch (e) {
    console.warn('[analytics] logIn failed', e);
  }
}

/** Back to anonymous after Clerk sign-out. Only unlinks the user id — no
 * reset(), which would rotate the install's device/anonymous identity. */
export function logOutAnalytics(): void {
  if (!sdk) return;
  try {
    sdk.clearAppUserId();
  } catch (e) {
    console.warn('[analytics] logOut failed', e);
  }
}

/** `sign_up` or `login`. Only for a session that began during this app run —
 * IdentitySync tells a restored session from a fresh one and picks the kind. */
export function trackAuth(kind: 'sign_up' | 'login', method: string): void {
  trackEvent(kind, { method });
}

/** Merge user-level properties (subscription_tier, signup_date …). Keys with
 * an undefined value are skipped. */
export function setAnalyticsUserProperties(properties: UserProperties): void {
  if (!sdk) return;
  const defined = Object.fromEntries(
    Object.entries(properties).filter(([, v]) => v !== undefined),
  );
  if (!Object.keys(defined).length) return;
  try {
    sdk.setUserProperties(defined).catch((e) => {
      console.warn('[analytics] setUserProperties failed', e);
    });
  } catch (e) {
    console.warn('[analytics] setUserProperties failed', e);
  }
}

/** A completed store transaction, already reduced to plain values by
 * purchases.ts so the RevenueCat types stay behind that boundary. */
export type PurchaseRecord = {
  productId: string;
  /** Unit price in `currency`; for a trial, the price the plan will bill. */
  price: number;
  currency: string;
  transactionId?: string;
  /** ISO 8601 billing period (P1M, P1Y); absent for one-time products. */
  period?: string;
  kind: 'subscription' | 'one_time';
  /** A free trial starting: `trial_start` (no revenue yet) is emitted instead
   * of `purchase_success`. The paid conversion later surfaces server-side. */
  isTrial: boolean;
};

/** `purchase_success` (product_id, revenue, currency, transaction_id, store)
 * or, for a trial, `trial_start` with the same identifiers and zero revenue. */
export function trackPurchaseCompleted(record: PurchaseRecord): void {
  if (!sdk) return;
  const store = Platform.OS === 'ios' ? 'app_store' : 'play_store';
  try {
    if (record.isTrial) {
      sdk.track('trial_start', {
        product_id: record.productId,
        price: record.price,
        currency: record.currency,
        revenue: 0,
        store,
        ...(record.transactionId ? { transaction_id: record.transactionId } : {}),
        ...(record.period ? { period: record.period } : {}),
      });
      return;
    }
    trackPurchase(sdk, {
      productId: record.productId,
      price: record.price,
      currency: record.currency,
      transactionId: record.transactionId,
      store,
      properties: { kind: record.kind, ...(record.period ? { period: record.period } : {}) },
    });
  } catch (e) {
    console.warn('[analytics] trackPurchase failed', e);
  }
}

/** The slice of react-native-purchases that connectRevenueCat consumes,
 * duck-typed so the RevenueCat SDK stays behind the purchases.ts boundary.
 * Note the wrapped return: Layers destructures `{ customerInfo }`. */
type PurchasesBridge = {
  addCustomerInfoUpdateListener: (listener: (info: RevenueCatCustomerInfo) => void) => void;
  getCustomerInfo: () => Promise<{ customerInfo: RevenueCatCustomerInfo }>;
};

/** Bridge RevenueCat's customer-info stream into Layers: a newly appearing
 * subscription becomes a `subscription_start` event on the attributed
 * install, and subscriber status lands as an `is_subscriber` user property.
 * Called by initPurchases; waits out our own init first. */
export async function connectPurchasesAnalytics(purchases: PurchasesBridge): Promise<void> {
  if (!sdk) return;
  await initAnalytics();
  connectRevenueCat({ sdk }, purchases);
}

/**
 * iOS App Tracking Transparency. The first call presents the one-shot OS
 * prompt; every later call returns the stored answer instantly and re-records
 * it on the Layers device context (IDFA is collected only while authorized),
 * so callers may invoke this on each launch. ATT gates the identifier only —
 * event collection itself is unaffected. Android and web: no-op.
 *
 * `delayMs` lets a caller wait out a modal dismissal first: a system alert
 * requested mid-transition can come back not_determined without showing.
 */
export async function requestTrackingConsent(delayMs = 0): Promise<void> {
  if (!sdk || Platform.OS !== 'ios') return;
  try {
    await initAnalytics();
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await sdk.requestTrackingPermission();
  } catch (e) {
    console.warn('[analytics] tracking permission failed', e);
  }
}

/** Emits $screen_view (with previous_screen_name) on every route change.
 * Mount once in the root layout, inside the router context. */
export function useAnalyticsScreenTracking(): void {
  useLayersExpoRouterTracking(sdk, usePathname, useGlobalSearchParams);
}
