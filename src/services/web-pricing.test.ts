import { currencyForLocale, proPriceFrom } from './web-pricing';

describe('currencyForLocale', () => {
  it('maps regions with a Web Billing price', () => {
    expect(currencyForLocale('en-GB')).toBe('GBP');
    expect(currencyForLocale('en-US')).toBe('USD');
    expect(currencyForLocale('sv_SE')).toBe('SEK');
    expect(currencyForLocale('ja-JP')).toBe('JPY');
  });

  it('falls back to EUR for region-less or unpriced locales', () => {
    expect(currencyForLocale('en')).toBe('EUR');
    expect(currencyForLocale('de-DE')).toBe('EUR');
    expect(currencyForLocale('hi-IN')).toBe('EUR');
    expect(currencyForLocale(undefined)).toBe('EUR');
  });
});

describe('proPriceFrom', () => {
  it('formats the intro price in the visitor currency', () => {
    expect(proPriceFrom('en-US')).toBe('from $1.99/month');
    expect(proPriceFrom('en-GB')).toBe('from £1.79/month');
    expect(proPriceFrom('en')).toBe('from €1.99/month');
    expect(proPriceFrom('en-JP')).toBe('from ¥300/month');
    expect(proPriceFrom('en-SE')).toMatch(/^from (SEK\s25|25\skr)\/month$/);
  });
});
