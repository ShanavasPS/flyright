/** Pure daily-quota rules for live flight lookups, shared by the Convex
 * mutation that counts them and by tests. The lookup proxies a metered
 * provider, so every request is budgeted per caller per UTC day:
 *
 *  - signed-in Pro:  generous — a travel day of polling plus a few imports
 *  - signed-in free: enough for a busy import and some manual adds
 *  - anonymous:      the web compensation checker only, capped per address
 *
 * A request that also resolves the inbound rotation is two provider calls
 * and costs two units. */

export type LookupSubject =
  | { kind: 'user'; userId: string; pro: boolean }
  | { kind: 'anonymous'; address: string };

export const LOOKUP_LIMITS = {
  pro: 100,
  free: 20,
  anonymous: 5,
} as const;

export function lookupLimit(subject: LookupSubject): number {
  if (subject.kind === 'anonymous') return LOOKUP_LIMITS.anonymous;
  return subject.pro ? LOOKUP_LIMITS.pro : LOOKUP_LIMITS.free;
}

/** 'YYYY-MM-DD' in UTC — the quota window. */
export function lookupDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Storage key for one caller's counter on one day. */
export function lookupKey(subject: LookupSubject, day: string): string {
  const who = subject.kind === 'user' ? `user:${subject.userId}` : `ip:${subject.address}`;
  return `${who}:${day}`;
}

export interface LookupBudget {
  allowed: boolean;
  limit: number;
  /** Units left after this request (0 when refused). */
  remaining: number;
}

/** Whether a request costing `cost` fits under the limit given `used` so far. */
export function budget(used: number, cost: number, limit: number): LookupBudget {
  const allowed = used + cost <= limit;
  return { allowed, limit, remaining: allowed ? limit - used - cost : 0 };
}
