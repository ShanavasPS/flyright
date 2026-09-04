/** Pure policy for spending the aviation-data provider's monthly budget,
 * shared by the two places that call it — the EAS Hosting route
 * (src/app/api/flight-status+api.ts) and the Convex poll chain
 * (convex/flightData.ts) — and by tests. No ctx, no I/O.
 *
 * Why this exists: the per-caller daily meter in lookupShared.ts bounds what
 * one user can spend, which is fairness. It does not bound the bill. The
 * provider sells a fixed pool of API *units* per month, every request costs
 * more than one of them, and both call sites draw on the same pool, so the
 * pool needs its own accounting or a busy week takes live data down for
 * everyone with a 502.
 *
 * Two levers live here:
 *
 *  1. A cache, so identical questions are asked once. The provider's terms
 *     (Art. 5.5) permit storing responses for up to 7 consecutive days, and
 *     require deleting them after — hence CACHE_MAX_AGE_MS and the prune
 *     cron in crons.ts. TTL follows the flight's phase: a flight that landed
 *     yesterday can never change again, one boarding right now changes by
 *     the minute.
 *  2. A degradation ladder, so a nearly-spent pool sheds the least valuable
 *     calls first instead of failing at the cliff edge.
 */

/** Endpoint cost in provider units. AeroDataBox prices per endpoint tier
 * (Tier 1 = 1 unit, Tier 2 = 2, Tier 3 = 6); the two endpoints we call are
 * Tier 2. Measured, not assumed: 289 requests drained a 600-unit plan.
 * If a plan's dashboard ever disagrees with this, this constant is wrong. */
export const UNITS_PER_FLIGHT_CALL = 2;

/**
 * Whether the provider bills us for a response with this status.
 *
 * It charges for a request it processed — a hit and a genuine "no such
 * flight" alike. It does not charge for one it refused (429, pool spent) or
 * failed outright (5xx), because no work was done. Counting those would
 * drain our own accounting for calls the invoice never sees, and the caller's
 * daily allowance is refunded for exactly the same set (convex/provider.ts
 * refundQuota).
 */
export function providerBills(status: number, ok: boolean): boolean {
  return ok || status === 404 || status === 204;
}

/** The provider's hard ceiling on how long a response may be retained. */
export const CACHE_MAX_AGE_MS = 7 * 24 * 3_600_000;

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/** What the cache needs to know about a flight to age its facts. Deliberately
 * a subset of the normalized response, so both call sites can build one. */
export interface CachePhaseInput {
  /** Scheduled times, ISO, as the normalizer emits them. */
  scheduledDeparture: string | null;
  scheduledArrival: string | null;
  /** True once the flight has actually landed. */
  landed: boolean;
}

export type FlightPhase =
  | 'final'
  | 'settling'
  | 'distant'
  | 'approach_day'
  | 'gate_window'
  | 'in_flight'
  | 'arriving';

/**
 * Which phase a flight is in, from the caller's clock. Phase boundaries are
 * chosen so the TTL below is never longer than the interval over which the
 * underlying facts can move.
 */
export function flightPhase(facts: CachePhaseInput, now: number): FlightPhase {
  const dep = Date.parse(facts.scheduledDeparture ?? '');
  const arr = Date.parse(facts.scheduledArrival ?? '');

  if (facts.landed) {
    // A just-landed flight still gains facts: baggage belt appears, and the
    // gate-arrival actualTime often fills in minutes after touchdown. Only
    // once that has had time to settle is the record genuinely immutable.
    if (!Number.isNaN(arr) && now > arr + 3 * HOUR_MS) return 'final';
    return 'settling';
  }

  // No usable schedule (a malformed or very old record): treat as settled
  // rather than re-asking a provider that just told us it knows nothing.
  if (Number.isNaN(dep)) return 'final';

  const untilDep = dep - now;
  if (untilDep > 6 * HOUR_MS) return 'distant';
  if (untilDep > 90 * MINUTE_MS) return 'approach_day';
  if (untilDep > -30 * MINUTE_MS) return 'gate_window';
  const untilArr = Number.isNaN(arr) ? 0 : arr - now;
  return untilArr > 40 * MINUTE_MS ? 'in_flight' : 'arriving';
}

/** How long a response for a flight in this phase stays usable. */
export const PHASE_TTL_MS: Record<FlightPhase, number> = {
  // Immutable history — the compensation checker's bread and butter, and the
  // reason a claim lookup for a flight from March costs nothing to repeat.
  final: CACHE_MAX_AGE_MS,
  settling: 30 * MINUTE_MS,
  // Schedules do drift, but not hourly, and gate/terminal aren't published
  // this far out anyway.
  distant: 6 * HOUR_MS,
  approach_day: 30 * MINUTE_MS,
  // Gate, boarding and delay revisions all land in this window.
  gate_window: 5 * MINUTE_MS,
  in_flight: 20 * MINUTE_MS,
  arriving: 5 * MINUTE_MS,
};

/** Absolute expiry for a response observed now, capped at the terms' 7 days. */
export function cacheExpiry(facts: CachePhaseInput, now: number): number {
  const ttl = Math.min(PHASE_TTL_MS[flightPhase(facts, now)], CACHE_MAX_AGE_MS);
  return now + ttl;
}

// -- the degradation ladder ---------------------------------------------------

/** How freely the provider may be called right now.
 *
 *  - `full`      spend normally
 *  - `trim`      drop the speculative extras (the inbound rotation is a
 *                second and third request for a nicety)
 *  - `slow`      as `trim`, and background polling stretches its cadence
 *  - `essential` only a human waiting on an answer may spend; polls read cache
 *  - `exhausted` nobody spends; cache answers or the caller is told plainly
 */
export type Degradation = 'full' | 'trim' | 'slow' | 'essential' | 'exhausted';

/** Fraction of the monthly pool still unspent, at or below which each level
 * engages. Generous early because the pool refills monthly and an unspent
 * pool is wasted money — the point is to never hit zero mid-month, not to
 * hoard. */
const LADDER: ReadonlyArray<readonly [Degradation, number]> = [
  ['exhausted', 0],
  ['essential', 0.05],
  ['slow', 0.15],
  ['trim', 0.3],
] as const;

export function degradationFor(remaining: number, limit: number): Degradation {
  // Unknown pool size (a provider that sends no budget headers and no
  // configured ceiling): spend freely and rely on the per-caller meter.
  if (!Number.isFinite(limit) || limit <= 0) return 'full';
  const fraction = Math.max(0, remaining) / limit;
  for (const [level, threshold] of LADDER) {
    if (remaining <= 0 || fraction <= threshold) return level;
  }
  return 'full';
}

/** Whether a call may proceed at this degradation level. `interactive` means
 * a person is waiting on the answer (a lookup they just triggered); the poll
 * chain and the inbound rotation are not. */
export function maySpend(
  level: Degradation,
  kind: 'interactive' | 'background' | 'speculative',
): boolean {
  switch (level) {
    case 'full':
      return true;
    case 'trim':
      return kind !== 'speculative';
    case 'slow':
      return kind !== 'speculative';
    case 'essential':
      return kind === 'interactive';
    case 'exhausted':
      return false;
  }
}

/** Multiplier the poll chain applies to its cadence, stretching the same
 * number of provider calls over a longer travel day when the pool is thin. */
export function pollStretch(level: Degradation): number {
  if (level === 'slow') return 2;
  if (level === 'essential' || level === 'exhausted') return 4;
  return 1;
}

// -- reading the provider's own accounting ------------------------------------

export interface ProviderBudgetReading {
  remaining: number;
  limit: number;
  /** Seconds from now until the pool resets, when the provider says. */
  resetSeconds: number | null;
}

/** Header pairs that carry the monthly unit pool, most specific first.
 *
 * Each route to this API names them differently, and getting it wrong is
 * silent — the reading just comes back null and the local backstop counter
 * decides instead, which is exactly the blind spot this whole module exists
 * to remove. Both of these are verified against live responses:
 *
 *   direct gateway   x-api-units-{limit,remaining,reset}
 *   RapidAPI         x-ratelimit-api-units-{limit,remaining,reset}
 *
 * The generic `x-ratelimit-*` pair is a guess kept as a last resort for a
 * reseller we haven't measured. */
const BUDGET_HEADERS = [
  ['x-api-units-remaining', 'x-api-units-limit', 'x-api-units-reset'],
  [
    'x-ratelimit-api-units-remaining',
    'x-ratelimit-api-units-limit',
    'x-ratelimit-api-units-reset',
  ],
  ['x-ratelimit-remaining', 'x-ratelimit-limit', 'x-ratelimit-reset'],
] as const;

/** Roughly 2005 in epoch seconds. A reset value larger than this is an
 * absolute instant (the direct gateway's form) rather than a countdown
 * (RapidAPI's), and has to be turned into one to mean the same thing. */
const EPOCH_LOOKS_ABSOLUTE = 1_100_000_000;

/** The provider is the authority on what is left, so prefer its headers over
 * any counter of ours. */
export function readProviderBudget(
  get: (name: string) => string | null,
  now: number = Date.now(),
): ProviderBudgetReading | null {
  const num = (name: string): number | null => {
    const raw = get(name);
    if (raw === null || raw === undefined || `${raw}`.trim() === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  for (const [remainingKey, limitKey, resetKey] of BUDGET_HEADERS) {
    const remaining = num(remainingKey);
    const limit = num(limitKey);
    if (remaining === null || limit === null) continue;

    const reset = num(resetKey);
    const resetSeconds =
      reset === null
        ? null
        : reset > EPOCH_LOOKS_ABSOLUTE
          ? Math.max(0, Math.round(reset - now / 1000))
          : reset;
    return { remaining, limit, resetSeconds };
  }
  return null;
}

/** How long a reported reading is trusted. The provider refreshes it on every
 * call, so anything older than this means we have not called in a day and
 * should fall back to counting. */
const READING_TTL_MS = 26 * 3_600_000;

/** The stored pool state, as convex/provider.ts keeps it. */
export interface PoolState {
  reportedRemaining: number | null;
  reportedLimit: number | null;
  reportedAt: number | null;
  unitsSpent: number;
}

/**
 * What is left of the monthly pool, from stored state plus the configured
 * plan size. Returns `{remaining: 0, limit: 0}` for "unknown", which
 * degradationFor reads as `full` — an unmeasurable pool must not brick
 * lookups.
 *
 * The provider's own reading wins when we have a recent one: it bills us, and
 * it sees spend from environments and scripts our counter cannot. But a
 * reading is only *about* the plan whose size it reports. If it disagrees
 * with the plan we are configured for, it came from a different plan and
 * tells us nothing — the case that matters is switching reseller or tier,
 * where the old plan's exhausted reading would otherwise keep refusing calls
 * on the new one until the freshness window expired.
 */
export function poolFrom(
  state: PoolState | null,
  configuredLimit: number | null,
  now: number,
): { remaining: number; limit: number } {
  const fresh =
    state?.reportedAt !== null &&
    state?.reportedAt !== undefined &&
    now - state.reportedAt < READING_TTL_MS;
  const describesThisPlan = configuredLimit === null || state?.reportedLimit === configuredLimit;

  if (
    state &&
    fresh &&
    describesThisPlan &&
    state.reportedLimit &&
    state.reportedRemaining !== null
  ) {
    return { remaining: state.reportedRemaining, limit: state.reportedLimit };
  }

  if (configuredLimit === null) return { remaining: 0, limit: 0 };
  return {
    remaining: Math.max(0, configuredLimit - (state?.unitsSpent ?? 0)),
    limit: configuredLimit,
  };
}

/** Billing period key for the local backstop counter, 'YYYY-MM' in UTC.
 * Only used when the provider sends no budget headers; the reset day of the
 * real plan may differ, which is why the headers win when present. */
export function budgetPeriod(now: Date): string {
  return now.toISOString().slice(0, 7);
}
