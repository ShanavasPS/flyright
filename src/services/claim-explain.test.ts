import type { Journey } from '@/rules/types';

import { explainAmount, lateLabel, recentFlights } from './claim-explain';

const base = { regulation: 'EU261', fromCountry: 'FI', toCountry: 'GB', carrierCountry: 'FI', delayMinutes: 222, distanceKm: 1853 };

describe('explainAmount', () => {
  it('explains a mid-haul EU departure', () => {
    expect(explainAmount(base)).toEqual([
      { label: 'Distance', value: '1,853 km', why: '1,500–3,500 km: €400' },
      { label: 'Arrival', value: '3 h 42 min late', why: 'Over 3 h: compensation due' },
      { label: 'Covered by', value: 'EU261', why: 'Leaves the EU' },
    ]);
  });

  it('says the intra-EU cap and never halves it', () => {
    const rows = explainAmount({ ...base, toCountry: 'ES', distanceKm: 4700, delayMinutes: 200 });
    expect(rows[0].why).toBe('Within the EU, over 1,500 km: capped at €400');
    expect(rows[1].why).toBe('Over 3 h: compensation due');
  });

  it('halves a long flight out of the EU under 4 h', () => {
    const rows = explainAmount({ ...base, toCountry: 'US', distanceKm: 6600, delayMinutes: 210 });
    expect(rows[0].why).toBe('Over 3,500 km: €600');
    expect(rows[1].why).toBe('Under 4 h on a long flight: halved to €300');
  });

  it('says a delay was not recorded instead of guessing', () => {
    expect(explainAmount({ ...base, delayMinutes: null })[1]).toEqual({
      label: 'Arrival',
      value: 'Delay not recorded',
      why: 'Open the trip to check it',
    });
  });

  it('names an arrival into the EU and the UK bands', () => {
    expect(explainAmount({ ...base, fromCountry: 'US', toCountry: 'DE', distanceKm: 6200 })[2].why).toBe(
      'Arrives in the EU on an EU airline',
    );
    const uk = explainAmount({ ...base, regulation: 'UK261', fromCountry: 'GB', toCountry: 'US', distanceKm: 5500, delayMinutes: 300 });
    expect(uk[0].why).toBe('Over 3,500 km: £520');
    expect(uk[2].why).toBe('Leaves the UK');
  });

  it('explains nothing for other regulations', () => {
    expect(explainAmount({ ...base, regulation: 'EU Rail 2021/782' })).toEqual([]);
  });
});

describe('lateLabel', () => {
  it('reads minutes as a traveller would', () => {
    expect(lateLabel(0)).toBe('On time');
    expect(lateLabel(14)).toBe('On time');
    expect(lateLabel(38)).toBe('38 min late');
    expect(lateLabel(180)).toBe('3 h late');
    expect(lateLabel(222)).toBe('3 h 42 min late');
  });
});

describe('recentFlights', () => {
  const journey = (id: string, to: string, toCountry: string, km: number): Journey => ({
    id,
    mode: 'flight',
    carrier: 'Finnair',
    carrierCountry: 'FI',
    number: `AY${id}`,
    from: { code: 'HEL', country: 'FI' },
    to: { code: to, country: toCountry },
    distanceKm: km,
    scheduledDeparture: '2026-01-01T00:00:00Z',
    scheduledArrival: '2026-01-01T03:00:00Z',
  });
  const NOW = Date.parse('2026-09-22T12:00:00Z');
  const rows = [
    { id: '1', journey: journey('1', 'ARN', 'SE', 400), scheduledArrival: '2026-08-14T05:35:00Z', delayMinutes: 5 },
    { id: '2', journey: journey('2', 'LHR', 'GB', 1853), scheduledArrival: '2026-08-12T08:10:00Z', delayMinutes: 222 },
    { id: '3', journey: journey('3', 'BER', 'DE', 1100), scheduledArrival: '2026-04-03T09:00:00Z', delayMinutes: null },
    { id: '4', journey: journey('4', 'JFK', 'US', 6600), scheduledArrival: '2026-10-07T18:00:00Z', delayMinutes: null },
    { id: '5', journey: journey('5', 'MAD', 'ES', 2950), scheduledArrival: '2026-07-01T10:00:00Z', delayMinutes: 38 },
  ];

  it('lists flown flights newest first, with what is known about each', () => {
    expect(recentFlights(rows, new Set(['2']), NOW)).toEqual([
      { id: '1', title: 'Finnair AY1', route: 'HEL → ARN', status: 'On time', owed: null, claimed: false },
      { id: '2', title: 'Finnair AY2', route: 'HEL → LHR', status: '3 h 42 min late', owed: '€400 owed', claimed: true },
      { id: '5', title: 'Finnair AY5', route: 'HEL → MAD', status: '38 min late', owed: null, claimed: false },
      { id: '3', title: 'Finnair AY3', route: 'HEL → BER', status: 'Not checked', owed: null, claimed: false },
    ]);
  });

  it('respects the limit and skips flights still ahead', () => {
    const out = recentFlights(rows, new Set(), NOW, 2);
    expect(out.map((f) => f.id)).toEqual(['1', '2']);
  });
});
