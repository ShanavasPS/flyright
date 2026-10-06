import { wholeTripsPast, type PersonTrip } from '@/components/person-travel';

jest.mock('@/components/travel-globe', () => ({ TravelGlobe: () => null }));

const HELSINKI = { city: 'Helsinki', country: 'FI' };

function leg(id: string, from: string, to: string, dep: string, arr: string): PersonTrip {
  return {
    journeyId: id, carrier: 'Finnair', number: id, fromCode: from, toCode: to,
    scheduledDeparture: dep, scheduledArrival: arr, home: HELSINKI,
  };
}

// Newest first, as the server sends it.
const bangkok = [
  leg('b4', 'DOH', 'HEL', '2026-09-10T22:00:00Z', '2026-09-11T04:20:00Z'),
  leg('b3', 'BKK', 'DOH', '2026-09-10T13:00:00Z', '2026-09-10T20:00:00Z'),
  leg('b2', 'DOH', 'BKK', '2026-09-03T21:35:00Z', '2026-09-04T04:20:00Z'),
  leg('b1', 'HEL', 'DOH', '2026-09-03T14:00:00Z', '2026-09-03T19:50:00Z'),
];
/** Out and back to Stockholm on day `d` of August, newest leg first. */
const stockholm = (d: number) => {
  const day = `2026-08-${String(d).padStart(2, '0')}`;
  return [
    leg(`s${d}b`, 'ARN', 'HEL', `${day}T18:00:00Z`, `${day}T19:00:00Z`),
    leg(`s${d}a`, 'HEL', 'ARN', `${day}T07:00:00Z`, `${day}T08:00:00Z`),
  ];
};

describe('wholeTripsPast', () => {
  it('passes a list no longer than the minimum through untouched', () => {
    expect(wholeTripsPast(bangkok, 10)).toBe(bangkok);
  });

  it('takes the trip the cut lands in whole instead of splitting it', () => {
    // 4 day trips (8 legs) newer than Bangkok: a 10-leg cut would keep only
    // Bangkok's return; the whole trip comes instead, and nothing older.
    const newer = [...stockholm(28), ...stockholm(27), ...stockholm(26), ...stockholm(25)].map((t) => ({
      ...t,
      scheduledDeparture: t.scheduledDeparture.replace('2026-08', '2026-09'),
      scheduledArrival: t.scheduledArrival.replace('2026-08', '2026-09'),
    }));
    const past = [...newer, ...bangkok, ...stockholm(20), ...stockholm(10)];
    const shown = wholeTripsPast(past, 10);
    expect(shown.map((t) => t.journeyId)).toEqual([...newer, ...bangkok].map((t) => t.journeyId));
  });

  it('stops as soon as whole trips reach the minimum', () => {
    const past = [...stockholm(30), ...stockholm(29), ...stockholm(28), ...stockholm(27), ...stockholm(26), ...stockholm(25)];
    expect(wholeTripsPast(past, 10)).toHaveLength(10);
  });
});
