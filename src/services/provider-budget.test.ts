import {
  CACHE_MAX_AGE_MS,
  cacheExpiry,
  degradationFor,
  flightPhase,
  maySpend,
  pollStretch,
  poolFrom,
  providerBills,
  readProviderBudget,
  UNITS_PER_FLIGHT_CALL,
} from '../../convex/providerShared';

const HOUR = 3_600_000;
const MINUTE = 60_000;

/** A flight departing `offsetMs` from `now`, landing 2h later. */
function flight(now: number, offsetMs: number, landed = false) {
  return {
    scheduledDeparture: new Date(now + offsetMs).toISOString(),
    scheduledArrival: new Date(now + offsetMs + 2 * HOUR).toISOString(),
    landed,
  };
}

const NOW = Date.parse('2026-09-04T12:00:00Z');

describe('flightPhase', () => {
  it('treats a long-landed flight as immutable history', () => {
    // Departed 8h ago, so it landed ~6h ago — well past the settling window.
    expect(flightPhase(flight(NOW, -8 * HOUR, true), NOW)).toBe('final');
  });

  it('gives a just-landed flight time to settle', () => {
    // The belt number and the gate-arrival actual often arrive after
    // touchdown, so the record is not final yet.
    expect(flightPhase(flight(NOW, -2.5 * HOUR, true), NOW)).toBe('settling');
  });

  it('separates the phases of an unflown day', () => {
    expect(flightPhase(flight(NOW, 30 * HOUR), NOW)).toBe('distant');
    expect(flightPhase(flight(NOW, 3 * HOUR), NOW)).toBe('approach_day');
    expect(flightPhase(flight(NOW, 45 * MINUTE), NOW)).toBe('gate_window');
    // Just after a scheduled departure the gate window still applies: this is
    // exactly when a delay gets announced.
    expect(flightPhase(flight(NOW, -20 * MINUTE), NOW)).toBe('gate_window');
    expect(flightPhase(flight(NOW, -60 * MINUTE), NOW)).toBe('in_flight');
    expect(flightPhase(flight(NOW, -100 * MINUTE), NOW)).toBe('arriving');
  });

  it('does not re-ask about a record with no usable schedule', () => {
    expect(flightPhase({ scheduledDeparture: null, scheduledArrival: null, landed: false }, NOW)).toBe(
      'final',
    );
  });
});

describe('cacheExpiry', () => {
  it('keeps history for the longest the provider terms allow, and no longer', () => {
    const expiry = cacheExpiry(flight(NOW, -8 * HOUR, true), NOW);
    expect(expiry).toBe(NOW + CACHE_MAX_AGE_MS);
    // The terms cap retention at 7 days; nothing may outlive that.
    expect(expiry - NOW).toBeLessThanOrEqual(7 * 24 * HOUR);
  });

  it('expires a boarding flight within minutes', () => {
    const ttl = cacheExpiry(flight(NOW, 45 * MINUTE), NOW) - NOW;
    expect(ttl).toBe(5 * MINUTE);
  });

  it('never caches a flight for longer than its facts can hold still', () => {
    // In flight, the arrival estimate moves; 20 min is the most we'll claim.
    expect(cacheExpiry(flight(NOW, -60 * MINUTE), NOW) - NOW).toBe(20 * MINUTE);
  });
});

describe('degradationFor', () => {
  it('spends freely on a healthy pool', () => {
    expect(degradationFor(40_000, 40_000)).toBe('full');
    expect(degradationFor(20_000, 40_000)).toBe('full');
  });

  it('sheds the least valuable calls first as the pool empties', () => {
    expect(degradationFor(12_000, 40_000)).toBe('trim'); // 30%
    expect(degradationFor(6_000, 40_000)).toBe('slow'); // 15%
    expect(degradationFor(2_000, 40_000)).toBe('essential'); // 5%
    expect(degradationFor(0, 40_000)).toBe('exhausted');
  });

  it('treats an overdrawn pool as exhausted', () => {
    // The provider reports -1 remaining once a plan is over quota.
    expect(degradationFor(-1, 600)).toBe('exhausted');
  });

  it('spends freely when the pool size is unknown', () => {
    // No budget headers and no configured plan size: the per-caller daily
    // meter is the only brake, and refusing everything would be worse.
    expect(degradationFor(0, 0)).toBe('full');
  });
});

describe('poolFrom', () => {
  const fresh = { reportedRemaining: 39_000, reportedLimit: 40_000, reportedAt: NOW, unitsSpent: 500 };

  it('trusts a recent reading about the plan we are on', () => {
    // The provider bills us, so its own number beats our counter — it also
    // sees spend from other environments and scripts.
    expect(poolFrom(fresh, 40_000, NOW)).toEqual({ remaining: 39_000, limit: 40_000 });
  });

  it('ignores a reading left over from a different plan', () => {
    // The regression that bit us: the free tier's exhausted reading (600
    // units, -1 left) was still stored when the 40,000-unit plan went live,
    // and it refused every call on the new plan. A reading is only about the
    // plan whose size it reports.
    const stale = { reportedRemaining: -1, reportedLimit: 600, reportedAt: NOW, unitsSpent: 8 };
    const pool = poolFrom(stale, 40_000, NOW);
    expect(pool).toEqual({ remaining: 39_992, limit: 40_000 });
    expect(degradationFor(pool.remaining, pool.limit)).toBe('full');
  });

  it('falls back to counting once a reading goes stale', () => {
    const old = { ...fresh, reportedAt: NOW - 30 * HOUR };
    expect(poolFrom(old, 40_000, NOW)).toEqual({ remaining: 39_500, limit: 40_000 });
  });

  it('counts from the plan size when nothing has been reported yet', () => {
    expect(poolFrom(null, 40_000, NOW)).toEqual({ remaining: 40_000, limit: 40_000 });
  });

  it('reports an unknown pool when no plan size is configured', () => {
    // Unmeasurable must not mean unusable — degradationFor reads this as
    // 'full' and the per-caller meter is the only brake.
    expect(poolFrom(null, null, NOW)).toEqual({ remaining: 0, limit: 0 });
    expect(degradationFor(0, 0)).toBe('full');
  });

  it('never reports a negative backstop remainder', () => {
    const overspent = { reportedRemaining: null, reportedLimit: null, reportedAt: null, unitsSpent: 99_999 };
    expect(poolFrom(overspent, 40_000, NOW)).toEqual({ remaining: 0, limit: 40_000 });
  });
});

describe('maySpend', () => {
  it('protects a person waiting on an answer the longest', () => {
    expect(maySpend('essential', 'interactive')).toBe(true);
    expect(maySpend('essential', 'background')).toBe(false);
    expect(maySpend('essential', 'speculative')).toBe(false);
  });

  it('drops the inbound-rotation nicety first', () => {
    expect(maySpend('trim', 'interactive')).toBe(true);
    expect(maySpend('trim', 'background')).toBe(true);
    expect(maySpend('trim', 'speculative')).toBe(false);
  });

  it('stops everything once the pool is gone', () => {
    expect(maySpend('exhausted', 'interactive')).toBe(false);
  });
});

describe('pollStretch', () => {
  it('leaves a healthy pool alone and stretches a thin one', () => {
    expect(pollStretch('full')).toBe(1);
    expect(pollStretch('trim')).toBe(1);
    expect(pollStretch('slow')).toBe(2);
    expect(pollStretch('exhausted')).toBe(4);
  });
});

describe('readProviderBudget', () => {
  it('reads the units pair RapidAPI actually sends', () => {
    // Verbatim from a live 429 on the free plan.
    const headers: Record<string, string> = {
      'x-ratelimit-api-units-limit': '600',
      'x-ratelimit-api-units-remaining': '-1',
      'x-ratelimit-api-units-reset': '67752',
    };
    expect(readProviderBudget((n) => headers[n] ?? null)).toEqual({
      remaining: -1,
      limit: 600,
      resetSeconds: 67752,
    });
  });

  it('reads the different pair the direct gateway sends', () => {
    // Verbatim from a live 200 on the direct plan. These names share no
    // prefix with RapidAPI's, and missing them is silent — the pool would
    // just look unknown.
    const headers: Record<string, string> = {
      'x-api-units-limit': '40000',
      'x-api-units-remaining': '39998',
      'x-api-units-reset': '1791128125',
    };
    const now = Date.parse('2026-09-04T12:00:00Z');
    const reading = readProviderBudget((n) => headers[n] ?? null, now);
    expect(reading).toMatchObject({ remaining: 39998, limit: 40000 });
    // The direct gateway sends an absolute epoch, RapidAPI a countdown; both
    // have to come out of here meaning "seconds from now".
    expect(reading!.resetSeconds).toBe(Math.round(1791128125 - now / 1000));
    expect(reading!.resetSeconds).toBeGreaterThan(0);
  });

  it('confirms the measured 2 units per request', () => {
    // One call took the direct pool from 40000 to 39998.
    expect(40000 - 39998).toBe(UNITS_PER_FLIGHT_CALL);
  });

  it('falls back to the generic names another reseller might use', () => {
    const headers: Record<string, string> = {
      'x-ratelimit-limit': '40000',
      'x-ratelimit-remaining': '39998',
    };
    expect(readProviderBudget((n) => headers[n] ?? null)).toEqual({
      remaining: 39998,
      limit: 40000,
      resetSeconds: null,
    });
  });

  it('reports nothing when the provider says nothing', () => {
    expect(readProviderBudget(() => null)).toBeNull();
  });
});

describe('providerBills', () => {
  it('charges for a hit and for a legitimate miss', () => {
    // A "no such flight" was processed upstream and appears on the invoice,
    // so the caller pays for their typo just like for a hit.
    expect(providerBills(200, true)).toBe(true);
    expect(providerBills(404, false)).toBe(true);
    expect(providerBills(204, false)).toBe(true);
  });

  it('charges nothing for a refusal or a failure', () => {
    // These did no work upstream. Counting them would drain our accounting
    // for calls the invoice never sees, and billing the caller would make
    // them pay for our outage — hence the refund path.
    expect(providerBills(429, false)).toBe(false);
    expect(providerBills(502, false)).toBe(false);
    expect(providerBills(500, false)).toBe(false);
    expect(providerBills(503, false)).toBe(false);
  });
});

describe('UNITS_PER_FLIGHT_CALL', () => {
  it('matches the rate the provider actually charged', () => {
    // Measured on the live plan: the 600-unit pool read -1 remaining while
    // the separate request counter had logged 289 requests, so the pool
    // drained at ~2.08 units per request. That is a Tier 2 endpoint; the
    // fraction over 2 is the handful of requests that cost more (or the two
    // counters not sharing a reset instant), not a third unit.
    expect(Math.round(601 / 289)).toBe(UNITS_PER_FLIGHT_CALL);
  });
});
