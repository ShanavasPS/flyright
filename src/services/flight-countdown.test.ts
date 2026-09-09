import { flightCountdown, spanLabel } from './flight-countdown';

const now = new Date('2026-09-09T05:00:00Z');
const at = (iso: string) => ({ departure: iso, arrival: '2026-09-09T09:11:00Z' });

describe('spanLabel', () => {
  it('counts minutes inside the hour', () => {
    expect(spanLabel(45 * 60_000)).toBe('45m');
    expect(spanLabel(20_000)).toBe('1m');
  });
  it('counts hours and minutes inside the day', () => {
    expect(spanLabel(2 * 3_600_000 + 15 * 60_000)).toBe('2h 15m');
    expect(spanLabel(3 * 3_600_000)).toBe('3h');
  });
  it('counts days beyond', () => {
    expect(spanLabel(3 * 86_400_000 + 3_600_000)).toBe('3d');
  });
});

describe('flightCountdown', () => {
  it('counts down to departure', () => {
    expect(flightCountdown(at('2026-09-09T07:15:00Z'), now)).toBe('Departs in 2h 15m');
    expect(flightCountdown(at('2026-09-09T05:40:00Z'), now)).toBe('Departs in 40m');
    expect(flightCountdown(at('2026-09-12T05:00:00Z'), now)).toBe('Departs in 3d');
  });
  it('switches to arrival once departed', () => {
    expect(flightCountdown(at('2026-09-09T04:00:00Z'), now)).toBe('Lands in 4h 11m');
  });
  it('says nothing once landed, or when only one clock is known', () => {
    expect(
      flightCountdown({ departure: '2026-09-09T01:00:00Z', arrival: '2026-09-09T04:00:00Z' }, now),
    ).toBeNull();
    expect(
      flightCountdown({ departure: '2026-09-09T04:00:00Z', arrival: '2026-09-09T04:00:00Z' }, now),
    ).toBeNull();
    expect(flightCountdown({ departure: 'nope', arrival: 'nope' }, now)).toBeNull();
  });
});
