/** The web funnel's "from …/month" teaser, in the visitor's currency.
 *
 * Hand-kept mirror of the RevenueCat Web Billing prices (FlyRight Web app,
 * default offering, monthly intro product `flyright_pro_monthly_intro_web`):
 * the checkout itself resolves the currency from the visitor's location, so
 * this only has to be close enough that the teaser and the checkout agree.
 * Unknown regions fall back to EUR, exactly like Web Billing does.
 * Re-check when the dashboard prices change. */

export const MONTHLY_INTRO_PRICE: Record<string, number> = {
  EUR: 1.99,
  USD: 1.99,
  GBP: 1.79,
  CAD: 2.99,
  AUD: 2.99,
  NZD: 3.49,
  AED: 7.99,
  SAR: 7.99,
  QAR: 7.99,
  SEK: 25,
  NOK: 25,
  DKK: 15,
  CHF: 1.9,
  JPY: 300,
  SGD: 2.98,
  HKD: 15,
  PLN: 8.99,
  CZK: 49,
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

/** 'from €1.99/month' / 'from $1.99/month' / 'from ¥300/month'. */
export function proPriceFrom(locale: string | undefined): string {
  const currency = currencyForLocale(locale);
  const amount = MONTHLY_INTRO_PRICE[currency] ?? MONTHLY_INTRO_PRICE.EUR;
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(locale || 'en', {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    formatted = `${amount} ${currency}`;
  }
  return `from ${formatted}/month`;
}
