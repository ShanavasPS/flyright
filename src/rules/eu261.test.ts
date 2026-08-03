import { evaluate } from './engine';
import type { Disruption, Journey } from './types';

const flight = (overrides: Partial<Journey> = {}): Journey => ({
  id: 'j1',
  mode: 'flight',
  carrier: 'Lufthansa',
  carrierCountry: 'DE',
  number: 'LH873',
  from: { code: 'HEL', country: 'FI' },
  to: { code: 'FRA', country: 'DE' },
  distanceKm: 1530,
  scheduledDeparture: '2026-08-10T08:00:00Z',
  scheduledArrival: '2026-08-10T10:30:00Z',
  ...overrides,
});

const delay = (minutes: number, extra: Partial<Disruption> = {}): Disruption => ({
  type: 'delay',
  delayMinutes: minutes,
  ...extra,
});

describe('EU261 delays', () => {
  it('pays nothing under 3 hours', () => {
    const v = evaluate(flight(), delay(179));
    expect(v.eligible).toBe(false);
  });

  it('pays €250 for short-haul 3h+ delays', () => {
    const v = evaluate(flight({ distanceKm: 1400 }), delay(185));
    expect(v.compensation).toEqual({ amount: 250, currency: 'EUR' });
  });

  it('pays €400 for mid-haul 3h+ delays', () => {
    const v = evaluate(flight({ distanceKm: 2000 }), delay(200));
    expect(v.compensation).toEqual({ amount: 400, currency: 'EUR' });
  });

  it('halves long-haul compensation to €300 when delay is 3–4h', () => {
    const v = evaluate(
      flight({ distanceKm: 6000, to: { code: 'JFK', country: 'US' } }),
      delay(210),
    );
    expect(v.compensation).toEqual({ amount: 300, currency: 'EUR' });
  });

  it('pays €600 for long-haul 4h+ delays', () => {
    const v = evaluate(
      flight({ distanceKm: 6000, to: { code: 'JFK', country: 'US' } }),
      delay(260),
    );
    expect(v.compensation).toEqual({ amount: 600, currency: 'EUR' });
  });

  it('marks extraordinary circumstances ineligible but contestable', () => {
    const v = evaluate(flight(), delay(300, { extraordinaryCircumstances: true }));
    expect(v.eligible).toBe(false);
    expect(v.reason).toMatch(/contest/i);
  });

  it('covers non-EU carriers departing the EU', () => {
    const v = evaluate(
      flight({ carrier: 'United', carrierCountry: 'US', to: { code: 'EWR', country: 'US' }, distanceKm: 6600 }),
      delay(250),
    );
    expect(v.eligible).toBe(true);
  });

  it('does not cover non-EU carriers arriving into the EU', () => {
    const v = evaluate(
      flight({
        carrier: 'United',
        carrierCountry: 'US',
        from: { code: 'EWR', country: 'US' },
        to: { code: 'HEL', country: 'FI' },
        distanceKm: 6600,
      }),
      delay(250),
    );
    expect(v.eligible).toBe(false);
  });
});

describe('EU261 cancellations', () => {
  it('pays nothing with 14+ days notice', () => {
    const v = evaluate(flight(), { type: 'cancellation', noticeDays: 15 });
    expect(v.eligible).toBe(false);
  });

  it('pays with short notice', () => {
    const v = evaluate(flight({ distanceKm: 1200 }), { type: 'cancellation', noticeDays: 3, delayMinutes: 240 });
    expect(v.compensation).toEqual({ amount: 250, currency: 'EUR' });
  });
});

describe('UK261', () => {
  it('pays GBP bands for UK departures', () => {
    const v = evaluate(
      flight({ from: { code: 'LHR', country: 'GB' }, to: { code: 'JFK', country: 'US' }, carrierCountry: 'GB', distanceKm: 5500 }),
      delay(300),
    );
    expect(v.regulation).toBe('UK261');
    expect(v.compensation).toEqual({ amount: 520, currency: 'GBP' });
  });
});

describe('EU rail', () => {
  const train: Journey = {
    ...flight({ mode: 'train', carrier: 'VR', carrierCountry: 'FI', number: 'IC27' }),
    ticketPrice: { amount: 80, currency: 'EUR' },
  };

  it('pays 25% for 60–119 min delays', () => {
    const v = evaluate(train, delay(75));
    expect(v.compensation).toEqual({ amount: 20, currency: 'EUR' });
  });

  it('pays 50% for 120+ min delays', () => {
    const v = evaluate(train, delay(140));
    expect(v.compensation).toEqual({ amount: 40, currency: 'EUR' });
  });

  it('asks for ticket price when missing', () => {
    const v = evaluate({ ...train, ticketPrice: undefined }, delay(140));
    expect(v.eligible).toBe(false);
    expect(v.reason).toMatch(/ticket price/i);
  });
});
