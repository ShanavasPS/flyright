import { budget, lookupDay, lookupKey, lookupLimit, LOOKUP_LIMITS } from '../../convex/lookupShared';

describe('lookup quota rules', () => {
  it('sizes the daily budget by who is asking', () => {
    expect(lookupLimit({ kind: 'user', userId: 'u1', pro: true })).toBe(LOOKUP_LIMITS.pro);
    expect(lookupLimit({ kind: 'user', userId: 'u1', pro: false })).toBe(LOOKUP_LIMITS.free);
    expect(lookupLimit({ kind: 'anonymous', address: 'abc' })).toBe(LOOKUP_LIMITS.anonymous);
    expect(LOOKUP_LIMITS.pro).toBeGreaterThan(LOOKUP_LIMITS.free);
    expect(LOOKUP_LIMITS.free).toBeGreaterThan(LOOKUP_LIMITS.anonymous);
  });

  it('keys counters per caller per UTC day', () => {
    const day = lookupDay(new Date('2026-09-04T23:30:00+03:00'));
    expect(day).toBe('2026-09-04');
    expect(lookupKey({ kind: 'user', userId: 'u1', pro: false }, day)).toBe('user:u1:2026-09-04');
    expect(lookupKey({ kind: 'anonymous', address: 'h' }, day)).toBe('ip:h:2026-09-04');
  });

  it('refuses a request that would cross the limit and reports what is left', () => {
    expect(budget(0, 1, 20)).toEqual({ allowed: true, limit: 20, remaining: 19 });
    expect(budget(19, 1, 20)).toEqual({ allowed: true, limit: 20, remaining: 0 });
    // An inbound-rotation request costs two units.
    expect(budget(19, 2, 20)).toEqual({ allowed: false, limit: 20, remaining: 0 });
    expect(budget(20, 1, 20)).toEqual({ allowed: false, limit: 20, remaining: 0 });
  });
});
