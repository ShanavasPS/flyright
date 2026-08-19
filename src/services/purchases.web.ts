// Web build of the purchases boundary. react-native-purchases is native-only,
// so the web/static-export bundle gets the same API surface with inert
// fallbacks — the web app is informational, billing happens in the apps.

import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import type { PurchaseOutcome } from './purchases';

export type { PurchaseOutcome };

export const ENTITLEMENT_PRO = 'FlyRight Pro';
export const CC_ACTION_CHANGE_PLAN = 'change_plan';
export const OFFERING_CHANGE_PLAN = 'change-plan';

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

export async function restorePurchases(): Promise<boolean> {
  return false;
}
