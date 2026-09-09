import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { airportZone } from './airportZones';
import { type LegLike, instantWith, onwardFrom } from './itineraryShared';

/** Instants for the server: stored strings pinned with the same airport-zone
 * table the app uses. */
export const legInstant = instantWith(airportZone);

/** What a follower may know about a connecting leg — the same public fields
 * a shared trip carries, nothing else. */
export interface OnwardLeg {
  journeyId: Doc<'journeys'>['_id'];
  carrier: string;
  number: string;
  fromCode: string;
  toCode: string;
  scheduledDeparture: string;
  scheduledArrival: string;
}

/** The legs that continue `from` in the owner's journal — the rest of the
 * itinerary a follower is watching one leg of. Close-circle-only legs stay
 * out unless the viewer holds a close seat, the same rule as the trip list. */
export async function onwardLegs(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  from: LegLike,
  seesHidden: boolean,
): Promise<OnwardLeg[]> {
  const journeys = await ctx.db
    .query('journeys')
    .withIndex('by_user', (q) => q.eq('userId', ownerId))
    .collect();
  const candidates = journeys.filter(
    (j) => !j.deletedAt && (seesHidden || !j.hiddenFromCircle) && !Number.isNaN(Date.parse(j.scheduledDeparture)),
  );
  return onwardFrom(from, candidates, legInstant).map((j) => ({
    journeyId: j._id,
    carrier: j.carrier,
    number: j.number,
    fromCode: j.fromCode,
    toCode: j.toCode,
    scheduledDeparture: j.scheduledDeparture,
    scheduledArrival: j.scheduledArrival,
  }));
}
