import { parsePrice, priceText } from './price';

describe('ticket price as typed', () => {
  it('reads the amount and the currency', () => {
    expect(parsePrice('412', 'EUR')).toEqual({ amount: 412, currency: 'EUR' });
    expect(parsePrice('412 usd', 'EUR')).toEqual({ amount: 412, currency: 'USD' });
    expect(parsePrice('€412.50', null)).toEqual({ amount: 412.5, currency: 'EUR' });
    expect(parsePrice('$736.44', 'EUR')).toEqual({ amount: 736.44, currency: 'USD' });
    expect(parsePrice('1 234,50 SEK', null)).toEqual({ amount: 1234.5, currency: 'SEK' });
    expect(parsePrice('1,234.50 GBP', null)).toEqual({ amount: 1234.5, currency: 'GBP' });
    expect(parsePrice('INR 18,353', null)).toEqual({ amount: 18353, currency: 'INR' });
  });

  it('is nothing without an amount or a currency', () => {
    expect(parsePrice('', 'EUR')).toBeNull();
    expect(parsePrice('EUR', 'EUR')).toBeNull();
    expect(parsePrice('412', null)).toBeNull();
    expect(parsePrice('0', 'EUR')).toBeNull();
  });

  it('shows a stored price for editing', () => {
    expect(priceText(412.5, 'EUR')).toBe('412.5 EUR');
    expect(priceText(null, 'EUR')).toBe('');
  });
});
