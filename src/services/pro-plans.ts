import type { PurchasesPackage } from 'react-native-purchases';

export function sortPlans<T extends Pick<PurchasesPackage, 'packageType'>>(plans: T[]): T[] {
  const rank = (p: T) => p.packageType === 'MONTHLY' ? 0 : p.packageType === 'ANNUAL' ? 1 : 2;
  return [...plans].sort((a, b) => rank(a) - rank(b));
}
export function planName(p: PurchasesPackage): string {
  return p.packageType === 'MONTHLY' ? 'Monthly' : p.packageType === 'ANNUAL' ? 'Yearly' : p.packageType === 'LIFETIME' ? 'Lifetime' : p.product.title;
}
export function planPrice(p: PurchasesPackage): string {
  const period = p.product.subscriptionPeriod;
  if (!period) return p.product.priceString;
  const match = /^P(\d+)([DWMY])$/.exec(period);
  if (!match) return `${p.product.priceString} · ${period}`;
  const unit = { D: 'day', W: 'week', M: 'month', Y: 'year' }[match[2]];
  return `${p.product.priceString} / ${match[1] === '1' ? unit : `${match[1]} ${unit}s`}`;
}
