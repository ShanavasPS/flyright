// Web build of the purchases boundary. react-native-purchases is native-only,
// so the web/static-export bundle gets the same API surface with inert
// fallbacks — the web app is informational, billing happens in the apps.

import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import type { PurchaseOutcome } from './purchases';

export type { PurchaseOutcome };

export const ENTITLEMENT_PRO = 'Owed Pro';
export const OFFERING_CHANGE_PLAN = 'change-plan';

// The web funnel does sell Pro (web paywall/checkout), so screens that gate on
// billing keep gating here — only the Galaxy Store native build turns this off.
export const billingAvailable = true;

export const useCustomerInfo = (): CustomerInfo | null => null;
export const useHasPro = () => false;
export const useProEntitlement = () => null;

const NO_SUBSCRIPTIONS: string[] = [];
export const useActiveSubscriptions = () => NO_SUBSCRIPTIONS;

export function initPurchases() {}

export const isPurchasesConfigured = () => false;

export async function logInPurchases(_userId: string) {}

export async function logOutPurchases() {}

export async function hasPro(): Promise<boolean> {
  return false;
}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  return null;
}

export async function getOfferingByIdentifier(
  _identifier: string,
): Promise<PurchasesOffering | null> {
  return null;
}

export async function purchase(_pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  return { status: 'error', message: 'Purchases are not available on web' };
}

export async function presentProPaywall(): Promise<boolean> {
  return false;
}

export type RefundRequestOutcome = 'submitted' | 'cancelled' | 'unavailable';

export async function beginRefundRequest(): Promise<RefundRequestOutcome> {
  return 'unavailable';
}

export async function getAppUserId(): Promise<string | null> {
  return null;
}

export async function restorePurchases(): Promise<boolean> {
  return false;
}
