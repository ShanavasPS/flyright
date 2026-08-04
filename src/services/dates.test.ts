import { countdown, localDateString } from './dates';

const NOW = new Date('2026-08-04T12:00:00Z');

describe('countdown', () => {
  it('shows hours under two days out', () => {
    expect(countdown('2026-08-05T18:00:00Z', NOW)).toEqual({ value: 30, unit: 'hours' });
  });

  it('shows days further out', () => {
    expect(countdown('2026-08-10T12:00:00Z', NOW)).toEqual({ value: 6, unit: 'days' });
  });

  it('shows elapsed time for past departures', () => {
    expect(countdown('2026-07-30T12:00:00Z', NOW)).toEqual({ value: 5, unit: 'days ago' });
  });

  it('treats departures within the hour as now', () => {
    expect(countdown('2026-08-04T12:30:00Z', NOW)).toEqual({ value: 0, unit: 'now' });
  });
});

describe('localDateString', () => {
  it('formats and offsets', () => {
    const base = new Date(2026, 7, 4); // 4 Aug 2026, local
    expect(localDateString(base)).toBe('2026-08-04');
    expect(localDateString(base, 1)).toBe('2026-08-05');
    expect(localDateString(base, -1)).toBe('2026-08-03');
  });
});
