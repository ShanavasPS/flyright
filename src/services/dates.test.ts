import { countdown, localDateString, travelDayTitle } from './dates';

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

describe('travelDayTitle', () => {
  // Local noon so calendar-day math is zone-independent in the assertions.
  const now = new Date(2026, 7, 4, 12, 0, 0);
  const at = (y: number, m: number, d: number, h = 9) => new Date(y, m, d, h).toISOString();

  it('names the nearest days', () => {
    expect(travelDayTitle(at(2026, 7, 4, 23), now)).toBe('Today');
    expect(travelDayTitle(at(2026, 7, 5, 1), now)).toBe('Tomorrow');
    expect(travelDayTitle(at(2026, 7, 3), now)).toBe('Yesterday');
  });

  it('counts days within a week either way', () => {
    expect(travelDayTitle(at(2026, 7, 6), now)).toBe('In 2 days');
    expect(travelDayTitle(at(2026, 7, 11), now)).toBe('In 7 days');
    expect(travelDayTitle(at(2026, 7, 2), now)).toBe('2 days ago');
    expect(travelDayTitle(at(2026, 6, 28), now)).toBe('7 days ago');
  });

  it('falls back to the date beyond a week, with the year when it differs', () => {
    expect(travelDayTitle(at(2026, 7, 12), now)).toBe(formatDay(at(2026, 7, 12)));
    expect(travelDayTitle(at(2027, 0, 3), now)).toMatch(/2027/);
    expect(travelDayTitle(at(2025, 7, 4), now)).toMatch(/2025/);
  });

  it('is empty for unparsable input', () => {
    expect(travelDayTitle('not-a-date', now)).toBe('');
  });
});

function formatDay(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

