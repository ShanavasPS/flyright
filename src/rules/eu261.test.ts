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

  it('caps intra-EU flights over 3,500 km at €400 (Art 7(1)(b))', () => {
    // Helsinki–Tenerife, ~4,700 km, both ends in the EU.
    const v = evaluate(
      flight({ distanceKm: 4700, to: { code: 'TFS', country: 'ES' } }),
      delay(300),
    );
    expect(v.compensation).toEqual({ amount: 400, currency: 'EUR' });
  });

  it('does not halve the intra-EU €400 for a 3–4h delay', () => {
    const v = evaluate(
      flight({ distanceKm: 4700, to: { code: 'TFS', country: 'ES' } }),
      delay(200),
    );
    expect(v.compensation).toEqual({ amount: 400, currency: 'EUR' });
  });

  it('counts the outermost regions as EU territory (Paris–Réunion)', () => {
    const out = evaluate(
      flight({ carrierCountry: 'FR', from: { code: 'CDG', country: 'FR' }, to: { code: 'RUN', country: 'RE' }, distanceKm: 9360 }),
      delay(300),
    );
    expect(out.compensation).toEqual({ amount: 400, currency: 'EUR' });
    const back = evaluate(
      flight({ carrierCountry: 'FR', from: { code: 'RUN', country: 'RE' }, to: { code: 'ORY', country: 'FR' }, distanceKm: 9360 }),
      delay(300),
    );
    expect(back.compensation).toEqual({ amount: 400, currency: 'EUR' });
  });

  it('counts the EEA as EU territory (Oslo–Gran Canaria)', () => {
    const v = evaluate(
      flight({ from: { code: 'OSL', country: 'NO' }, to: { code: 'LPA', country: 'ES' }, distanceKm: 4000 }),
      delay(300),
    );
    expect(v.compensation).toEqual({ amount: 400, currency: 'EUR' });
  });

  it('still pays €600 when a long flight leaves the EU', () => {
    const v = evaluate(
      flight({ distanceKm: 4700, to: { code: 'DXB', country: 'AE' } }),
      delay(300),
    );
    expect(v.compensation).toEqual({ amount: 600, currency: 'EUR' });
  });

  it('caps intra-EU denied boarding and short-notice cancellation at €400 too', () => {
    const j = flight({ distanceKm: 4700, to: { code: 'TFS', country: 'ES' } });
    expect(evaluate(j, { type: 'denied_boarding' }).compensation).toEqual({ amount: 400, currency: 'EUR' });
    expect(evaluate(j, { type: 'cancellation', noticeDays: 3, delayMinutes: 300 }).compensation).toEqual({
      amount: 400,
      currency: 'EUR',
    });
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

  it('keeps £520 on a long UK flight into the EU (only flights within the UK are capped)', () => {
    const v = evaluate(
      flight({ from: { code: 'LGW', country: 'GB' }, to: { code: 'LPA', country: 'ES' }, carrierCountry: 'GB', distanceKm: 3600 }),
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
