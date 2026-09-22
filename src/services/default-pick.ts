/**
 * What a wide window's detail pane shows before anyone has tapped a row
 * (docs/wide-layouts-plan.md §3.5). Pure, so the rules are pinned by tests.
 */
import { isClosed, type ClaimStatus } from '@/services/claim-status';

export interface PickableClaim {
  id: string;
  status: ClaimStatus;
  responseDeadline: string | null;
  createdAt: string;
}

/** The same test as components/claim-status `isOverdue`: a sent claim whose
 * reply deadline has passed. Kept here so this file stays pure. */
function overdue(claim: PickableClaim, now: number): boolean {
  return claim.status === 'sent' && !!claim.responseDeadline && Date.parse(claim.responseDeadline) < now;
}

const newestFirst = (a: PickableClaim, b: PickableClaim) => b.createdAt.localeCompare(a.createdAt);

/** The claim that needs you (reply overdue), else the newest open claim,
 * else the newest closed one. Returns the claim's id, or null for none. */
export function pickClaim(claims: readonly PickableClaim[], now: number): string | null {
  const sorted = [...claims].sort(newestFirst);
  const open = sorted.filter((c) => !isClosed(c.status));
  return (
    open.find((c) => overdue(c, now))?.id ??
    open[0]?.id ??
    sorted[0]?.id ??
    null
  );
}

export interface PickablePerson {
  userId: string;
  next?: { scheduledDeparture: string } | null;
}

/** Someone you follow who is in the air, else the one whose next trip
 * leaves soonest, else the first person you follow, else your first
 * follower. Requests are never picked — they are answered in their row. */
export function pickPerson(
  following: readonly PickablePerson[],
  followers: readonly PickablePerson[],
  flying: ReadonlySet<string>,
  now: number,
): string | null {
  const inAir = following.find((p) => flying.has(p.userId));
  if (inAir) return inAir.userId;
  let soonest: { id: string; at: number } | null = null;
  for (const p of following) {
    const at = p.next ? Date.parse(p.next.scheduledDeparture) : NaN;
    if (!Number.isFinite(at) || at < now) continue;
    if (!soonest || at < soonest.at) soonest = { id: p.userId, at };
  }
  return soonest?.id ?? following[0]?.userId ?? followers[0]?.userId ?? null;
}

/** The selection while it still exists; otherwise the default pick. */
export function keepOrFallback(
  selected: string | null,
  ids: ReadonlySet<string>,
  fallback: () => string | null,
): string | null {
  return selected != null && ids.has(selected) ? selected : fallback();
}
