/** Who a journey admits, from its two row flags. Pure: shared by every query
 * and mutation that decides whether a member may see a trip, so the rule
 * lives in one place. 'private' wins over the close-circle flag. */
export type Audience = 'circle' | 'close' | 'private';

type Flags = { hiddenFromCircle?: boolean; privateTrip?: boolean };

export function audienceOf(j: Flags): Audience {
  if (j.privateTrip) return 'private';
  return j.hiddenFromCircle ? 'close' : 'circle';
}

/** Whether a circle member may see this trip. `close` = the member is in the
 * owner's close circle. The owner themself is never asked. */
export function maySee(j: Flags, close: boolean): boolean {
  const audience = audienceOf(j);
  if (audience === 'private') return false;
  return audience === 'circle' || close;
}

/** Narrower audiences rank higher: a change to a higher rank drops followers,
 * a change to a lower one is news to whoever just gained the trip. */
export function audienceRank(audience: Audience) {
  return audience === 'private' ? 2 : audience === 'close' ? 1 : 0;
}
