import { currencyForLocale, proMonthlyPrice, proTrialLine } from './web-pricing';

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

describe('proTrialLine', () => {
  it('states the trial and the monthly price in the visitor currency', () => {
    expect(proTrialLine('en-US')).toBe('14-day free trial, then $4.99/month');
    expect(proTrialLine('en-GB')).toBe('14-day free trial, then £4.49/month');
    expect(proTrialLine('en')).toBe('14-day free trial, then €4.99/month');
    expect(proMonthlyPrice('en-JP')).toBe('¥800');
    expect(proMonthlyPrice('en-SE')).toMatch(/^(SEK\s59|59\skr)$/);
  });
});
