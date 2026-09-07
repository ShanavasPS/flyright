import {
  ALL_TIME,
  filterByPeriod,
  journalSpan,
  journeyDay,
  monthsWithFlights,
  periodLabel,
  yearsWithFlights,
} from './world-period';

const row = (scheduledDeparture: string, fromCode = 'HEL') => ({ scheduledDeparture, fromCode });

const rows = [
  row('2025-11-02T08:45Z', 'DXB'),
  row('2025-03-14T06:00Z'),
  row('2024-07-01T10:00Z'),
  // 23:50 local in Los Angeles on 31 Dec 2025 is stored as 07:50Z on 1 Jan 2026.
  row('2026-01-01T07:50Z', 'LAX'),
];

describe('journeyDay', () => {
  it('reads the departure date at the origin, not the UTC day', () => {
    expect(journeyDay(row('2026-01-01T07:50Z', 'LAX'))).toBe('2025-12-31');
    expect(journeyDay(row('2025-11-02T08:45Z', 'DXB'))).toBe('2025-11-02');
  });
});

describe('filterByPeriod', () => {
  it('returns every row for all time', () => {
    expect(filterByPeriod(rows, ALL_TIME)).toBe(rows);
  });

  it('narrows to a year by flight day', () => {
    const in2025 = filterByPeriod(rows, { kind: 'year', year: 2025 });
    expect(in2025.map((r) => r.scheduledDeparture)).toEqual([
      '2025-11-02T08:45Z',
      '2025-03-14T06:00Z',
      '2026-01-01T07:50Z',
    ]);
    expect(filterByPeriod(rows, { kind: 'year', year: 2026 })).toEqual([]);
  });

  it('narrows to a month', () => {
    expect(filterByPeriod(rows, { kind: 'month', year: 2025, month: 3 })).toHaveLength(1);
    expect(filterByPeriod(rows, { kind: 'month', year: 2025, month: 12 })).toHaveLength(1);
    expect(filterByPeriod(rows, { kind: 'month', year: 2025, month: 5 })).toHaveLength(0);
  });

  it('treats a range as inclusive on both ends', () => {
    const range = { kind: 'range' as const, from: '2025-03-14', to: '2025-11-02' };
    expect(filterByPeriod(rows, range)).toHaveLength(2);
    expect(filterByPeriod(rows, { ...range, to: '2025-11-01' })).toHaveLength(1);
  });
});

describe('journal shape', () => {
  it('lists years newest first and months with flights', () => {
    expect(yearsWithFlights(rows)).toEqual([2025, 2024]);
    expect([...monthsWithFlights(rows, 2025)].sort()).toEqual([11, 12, 3].sort());
  });

  it('spans the first to the last flight day', () => {
    expect(journalSpan(rows)).toEqual({ from: '2024-07-01', to: '2025-12-31' });
    expect(journalSpan([])).toBeNull();
  });
});

describe('periodLabel', () => {
  it('names each kind', () => {
    expect(periodLabel(ALL_TIME)).toBe('All time');
    expect(periodLabel({ kind: 'year', year: 2025 })).toBe('2025');
    expect(periodLabel({ kind: 'month', year: 2025, month: 11 })).toBe('Nov 2025');
    expect(periodLabel({ kind: 'month', year: 2025, month: 11 }, true)).toBe('November 2025');
    expect(periodLabel({ kind: 'range', from: '2025-03-02', to: '2025-04-14' })).toBe(
      '2 Mar – 14 Apr',
    );
    expect(periodLabel({ kind: 'range', from: '2025-03-02', to: '2025-04-14' }, true)).toBe(
      '2 Mar – 14 Apr 2025',
    );
    expect(periodLabel({ kind: 'range', from: '2025-12-20', to: '2026-01-05' }, true)).toBe(
      '20 Dec 2025 – 5 Jan 2026',
    );
    expect(periodLabel({ kind: 'range', from: '2025-03-02', to: '2025-03-02' }, true)).toBe(
      '2 Mar 2025',
    );
  });
});
