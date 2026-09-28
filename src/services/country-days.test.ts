import { getAirport } from './airports';
import { countryDays, countryDayYears } from './country-days';
import type { JourneyRow } from './journeys';

function flight(id: string, from: string, to: string, departure: string, arrival: string): JourneyRow {
  return {
    id, mode: 'flight', fromCode: from, toCode: to,
    fromCountry: getAirport(from)?.country ?? '', toCountry: getAirport(to)?.country ?? '',
    scheduledDeparture: departure, scheduledArrival: arrival, bookingReference: null, deletedAt: null,
  } as JourneyRow;
}

const HELSINKI = () => ({ city: 'Helsinki', country: 'FI' });
const NOW = Date.parse('2026-06-01T12:00:00Z');

/** The canvas example: a year of a Helsinki traveller. */
const year2025 = [
  flight('mad', 'HEL', 'MAD', '2025-01-10T08:00', '2025-01-10T12:00'),
  flight('mad-back', 'MAD', 'HEL', '2025-01-15T13:00', '2025-01-15T19:00'),
  flight('lhr', 'HEL', 'LHR', '2025-03-20T08:00', '2025-03-20T09:00'),
  flight('lhr-back', 'LHR', 'HEL', '2025-03-28T10:00', '2025-03-28T15:00'),
  // Tokyo through Doha, both ways: two-hour connections.
  flight('doh1', 'HEL', 'DOH', '2025-05-02T18:00', '2025-05-02T23:30'),
  flight('nrt', 'DOH', 'NRT', '2025-05-03T01:30', '2025-05-03T17:00'),
  flight('doh2', 'NRT', 'DOH', '2025-05-17T22:00', '2025-05-18T04:00'),
  flight('hel', 'DOH', 'HEL', '2025-05-18T07:00', '2025-05-18T12:00'),
  flight('bcn', 'HEL', 'BCN', '2025-06-03T08:00', '2025-06-03T11:00'),
  flight('bcn-back', 'BCN', 'HEL', '2025-06-08T12:00', '2025-06-08T17:00'),
  // Stockholm, then home from Tallinn: the flight between is missing.
  flight('arn', 'HEL', 'ARN', '2025-08-20T08:00', '2025-08-20T08:00'),
  flight('tll', 'TLL', 'HEL', '2025-08-26T10:00', '2025-08-26T10:30'),
  flight('jfk', 'HEL', 'JFK', '2025-10-01T10:00', '2025-10-01T12:00'),
  flight('bos', 'BOS', 'HEL', '2025-10-18T18:00', '2025-10-19T09:00'),
];

const days = (y: ReturnType<typeof countryDays>) => Object.fromEntries(y.countries.map(c => [c.country, c.days]));

describe('days per country in a year', () => {
  const y = countryDays(year2025, 2025, HELSINKI, NOW);

  it('counts any part of a day, so travel days count in both countries', () => {
    expect(days(y)).toEqual({ FI: 313, US: 18, JP: 15, ES: 12, GB: 9, SE: 1, EE: 1 });
    expect(y.countries[0]).toMatchObject({ country: 'FI', home: true });
    expect(y.abroadDays).toBe(56);
    expect(y.partial).toBe(false);
  });

  it('leaves a connection under a day out: Doha is transit', () => {
    expect(y.countries.find(c => c.country === 'QA')).toBeUndefined();
  });

  it('counts midnights too, the UK statutory residence test', () => {
    const uk = y.countries.find(c => c.country === 'GB')!;
    expect(uk.midnights).toBe(8);
    expect(y.countries.find(c => c.country === 'ES')!.midnights).toBe(10);
  });

  it('never gives the days around a missing flight to a country', () => {
    expect(y.notSure).toEqual([{ from: '2025-08-21', to: '2025-08-25', days: 5, landedIn: 'Stockholm', leftFrom: 'Tallinn', afterId: 'arn' }]);
    expect(y.notSureDays).toBe(5);
  });

  it('lists each country\'s stays newest first with their cities', () => {
    const spain = y.countries.find(c => c.country === 'ES')!;
    expect(spain.stays.map(s => [s.city, s.from, s.to, s.days])).toEqual([
      ['Barcelona', '2025-06-03', '2025-06-08', 6],
      ['Madrid', '2025-01-10', '2025-01-15', 6],
    ]);
    expect(spain.stays[1]).toMatchObject({ arrivalId: 'mad', departureId: 'mad-back' });
  });

  it('counts this year only up to today, and a stay still going on', () => {
    const now = Date.parse('2025-03-24T12:00:00Z');
    const partial = countryDays(year2025, 2025, HELSINKI, now);
    expect(partial.partial).toBe(true);
    expect(partial.end).toBe('2025-03-24');
    // In London since the 20th: the 20th to today.
    expect(days(partial).GB).toBe(5);
    expect(partial.countries.find(c => c.country === 'GB')!.midnights).toBe(4);
    expect(countryDayYears(year2025, now)).toEqual([2025]);
  });

  it('splits a stay over New Year between the two years', () => {
    const rows = [
      flight('out', 'HEL', 'BKK', '2025-12-28T10:00', '2025-12-29T06:00'),
      flight('back', 'BKK', 'HEL', '2026-01-04T09:00', '2026-01-04T16:00'),
    ];
    expect(days(countryDays(rows, 2025, HELSINKI, NOW)).TH).toBe(3);
    expect(days(countryDays(rows, 2026, HELSINKI, NOW)).TH).toBe(4);
    expect(countryDayYears(rows, NOW)).toEqual([2026, 2025]);
  });

  it('counts no home before the first flight unless it leaves from home', () => {
    const rows = [flight('one', 'LHR', 'HEL', '2025-06-01T10:00', '2025-06-01T15:00')];
    const y1 = countryDays(rows, 2025, HELSINKI, NOW);
    expect(days(y1).GB).toBe(1);
    expect(days(y1).FI).toBe(214);
    expect(y1.notSureDays).toBe(0);
  });

  it('counts a flight logged twice once', () => {
    const twice = [...year2025, { ...year2025[2]!, id: 'lhr-again' }, { ...year2025[3]!, id: 'lhr-back-again' }];
    const uk = countryDays(twice, 2025, HELSINKI, NOW).countries.find(c => c.country === 'GB')!;
    expect(uk).toMatchObject({ days: 9, midnights: 8 });
    expect(uk.stays).toHaveLength(1);
  });

  it('handles an empty journal', () => {
    expect(countryDays([], 2025, HELSINKI, NOW).countries).toEqual([]);
    expect(countryDayYears([], NOW)).toEqual([]);
  });
});
