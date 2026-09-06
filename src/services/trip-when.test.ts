import { relativeWhen } from './trip-when';

const NOW = new Date('2026-09-06T12:00:00Z');

describe('relativeWhen', () => {
  it('reads outward from today', () => {
    expect(relativeWhen('2026-09-06T23:00:00Z', NOW)).toBe('Today');
    expect(relativeWhen('2026-09-07T01:00:00Z', NOW)).toBe('Tomorrow');
    expect(relativeWhen('2026-09-09T09:00:00Z', NOW)).toBe('In 3 days');
    expect(relativeWhen('2026-09-15T09:00:00Z', NOW)).toBe('Next week');
    expect(relativeWhen('2026-10-01T09:00:00Z', NOW)).toBe('In 4 weeks');
    expect(relativeWhen('2026-11-28T11:25:00Z', NOW)).toBe('In 3 months');
    expect(relativeWhen('2028-01-01T09:00:00Z', NOW)).toBe('In over a year');
  });

  it('reads backward the same way', () => {
    expect(relativeWhen('2026-09-05T23:00:00Z', NOW)).toBe('Yesterday');
    expect(relativeWhen('2026-09-02T09:00:00Z', NOW)).toBe('4 days ago');
    expect(relativeWhen('2026-08-01T09:00:00Z', NOW)).toBe('5 weeks ago');
    expect(relativeWhen('2026-03-01T09:00:00Z', NOW)).toBe('6 months ago');
    expect(relativeWhen('2024-03-01T09:00:00Z', NOW)).toBe('Over a year ago');
  });

  it('does not round a late-night flight into the wrong day', () => {
    // 23:00 today and 01:00 tomorrow are 2 hours apart and still different days.
    expect(relativeWhen('2026-09-06T23:30:00Z', NOW)).toBe('Today');
    expect(relativeWhen('2026-09-07T00:30:00Z', NOW)).toBe('Tomorrow');
  });

  it('refuses a date it cannot read', () => {
    expect(relativeWhen('not a date', NOW)).toBeNull();
  });
});
