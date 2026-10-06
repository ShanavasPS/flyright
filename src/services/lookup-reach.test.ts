import { newestLookupDay, oldestLookupDay, providerHasDay, withinLookupReach } from './lookup-reach';

describe('lookup reach', () => {
  const now = Date.parse('2026-10-06T08:40:00Z');

  it('matches the provider: the day 180 days back is already gone', () => {
    expect(providerHasDay('2026-04-10', now)).toBe(true); // 179 days back
    expect(providerHasDay('2026-04-10', Date.parse('2026-10-07T00:00:01Z'))).toBe(false);
    expect(providerHasDay('2026-04-09', now)).toBe(false); // 180 days back
    expect(providerHasDay('2025-11-05', now)).toBe(false);
    expect(providerHasDay('2026-10-06', now)).toBe(true);
    expect(providerHasDay('not-a-day', now)).toBe(false);
  });

  it('offers only days the server will look up', () => {
    const today = new Date(2026, 9, 6, 10, 0);
    expect(oldestLookupDay(today)).toEqual(new Date(2026, 3, 11));
    expect(newestLookupDay(today)).toEqual(new Date(2027, 8, 6));
    expect(withinLookupReach('2026-04-11', today)).toBe(true);
    expect(withinLookupReach('2026-04-10', today)).toBe(false);
    expect(withinLookupReach('2025-11-05', today)).toBe(false);
    expect(withinLookupReach('2027-09-06', today)).toBe(true);
    expect(withinLookupReach('2027-09-07', today)).toBe(false);
  });
});
