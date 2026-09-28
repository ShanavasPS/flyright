/** The web funnel's price line, in the visitor's currency.
 *
 * Hand-kept mirror of the RevenueCat Web Billing prices (FlyRight Web app,
 * default offering, monthly product `flyright_pro_monthly_trial_web`): the
 * checkout itself resolves the currency from the visitor's location, so this
 * only has to be close enough that the page and the checkout agree. Unknown
 * regions fall back to EUR, exactly like Web Billing does. Re-check when the
 * dashboard prices change. Full ladder per currency (EUR): monthly 4.99 ·
 * yearly 29.99, both with a 14-day free trial for people who have never
 * subscribed · lifetime 49.99 (flyright_pro_lifetime_web_v2). Since
 * 2026-09-28 the web sells the same trial as the App Store and Google Play
 * (the €1.99 / €19.99 intro products are retired from the offering). */

export const TRIAL_DAYS = 14;

export const MONTHLY_PRICE: Record<string, number> = {
  EUR: 4.99,
  USD: 4.99,
  GBP: 4.49,
  CAD: 6.99,
  AUD: 7.99,
  NZD: 8.99,
  AED: 19.99,
  SAR: 19.99,
  QAR: 19.99,
  SEK: 59,
  NOK: 59,
  DKK: 39,
  CHF: 4.9,
  JPY: 800,
  SGD: 6.98,
  HKD: 38,
  PLN: 21.99,
  CZK: 129,
};

/** ISO region → currency, for the regions where a Web Billing price exists. */
const REGION_CURRENCY: Record<string, string> = {
  US: 'USD',
  GB: 'GBP',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  AE: 'AED',
  SA: 'SAR',
  QA: 'QAR',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  CH: 'CHF',
  LI: 'CHF',
  JP: 'JPY',
  SG: 'SGD',
  HK: 'HKD',
  PL: 'PLN',
  CZ: 'CZK',
};

/** Currency for a BCP-47 locale ('en-GB' → GBP). Region-less tags (plain
 * 'en', 'de') and unknown regions → EUR. */
export function currencyForLocale(locale: string | undefined): string {
  const region = locale?.split(/[-_]/)[1]?.toUpperCase();
  return (region && REGION_CURRENCY[region]) || 'EUR';
}

/** '€4.99' / '$4.99' / '¥800' — the monthly price after the trial. */
export function proMonthlyPrice(locale: string | undefined): string {
  const currency = currencyForLocale(locale);
  const amount = MONTHLY_PRICE[currency] ?? MONTHLY_PRICE.EUR;
  try {
    return new Intl.NumberFormat(locale || 'en', {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** '14-day free trial, then €4.99/month'. */
export function proTrialLine(locale: string | undefined): string {
  return `${TRIAL_DAYS}-day free trial, then ${proMonthlyPrice(locale)}/month`;
}
