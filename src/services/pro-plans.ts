import type { PurchasesPackage } from 'react-native-purchases';

export function sortPlans<T extends Pick<PurchasesPackage, 'packageType'>>(plans: T[]): T[] {
  const rank = (p: T) => p.packageType === 'MONTHLY' ? 0 : p.packageType === 'ANNUAL' ? 1 : 2;
  return [...plans].sort((a, b) => rank(a) - rank(b));
}
export function planName(p: PurchasesPackage): string {
  return p.packageType === 'MONTHLY' ? 'Monthly' : p.packageType === 'ANNUAL' ? 'Yearly' : p.packageType === 'LIFETIME' ? 'Lifetime' : p.product.title;
}
/** The store's introductory offer on a plan, worded for the plan card — "14-day
 * free trial" for a trial, "€1.99 for the first 3 months" for a paid intro — or null
 * when the plan has none. Callers gate this on eligibility: the store still
 * returns the offer for someone who already used it. */
export function planIntro(p: PurchasesPackage): string | null {
  const intro = p.product.introPrice;
  if (!intro || intro.cycles < 1 || intro.periodNumberOfUnits < 1) return null;
  const unit = { DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year' }[intro.periodUnit];
  if (!unit) return null;
  // A single stretch of trial reads better in days: "14 days", not "2 weeks".
  const [count, name] = unit === 'week' ? [intro.periodNumberOfUnits * intro.cycles * 7, 'day'] : [intro.periodNumberOfUnits * intro.cycles, unit];
  if (intro.price === 0) return `${count}-${name} free trial`;
  return `${intro.priceString} for the first ${count} ${count === 1 ? name : `${name}s`}`;
}
export const planHasTrial = (p: PurchasesPackage) => (p.product.introPrice?.price ?? 1) === 0;
export function planPrice(p: PurchasesPackage): string {
  const period = p.product.subscriptionPeriod;
  if (!period) return p.product.priceString;
  const match = /^P(\d+)([DWMY])$/.exec(period);
  if (!match) return `${p.product.priceString} · ${period}`;
  const unit = { D: 'day', W: 'week', M: 'month', Y: 'year' }[match[2]];
  return `${p.product.priceString} / ${match[1] === '1' ? unit : `${match[1]} ${unit}s`}`;
}
