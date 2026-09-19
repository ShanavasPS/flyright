import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { maySee } from './audience';
import { airportZone } from './airportZones';
import { type LegLike, earlierFrom, instantWith, onwardFrom } from './itineraryShared';

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

/** The trip keys a leg's updates are read from: the legs of its itinerary
 * that came before it, then the leg itself. A photo posted in Helsinki
 * belongs to the whole journey, so once the connecting leg is the one on
 * screen it still shows — it used to vanish the moment the first leg landed
 * and the follower's views moved on to the next flight. Close-circle legs
 * count only for a close member; a private leg never does. */
export async function itineraryKeys(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  leg: LegLike & { naturalKey: string },
  seesHidden: boolean,
): Promise<string[]> {
  const journeys = await ctx.db
    .query('journeys')
    .withIndex('by_user', (q) => q.eq('userId', ownerId))
    .collect();
  const candidates = journeys.filter(
    (j) =>
      !j.deletedAt &&
      j.naturalKey !== leg.naturalKey &&
      maySee(j, seesHidden) &&
      !Number.isNaN(Date.parse(j.scheduledDeparture)),
  );
  return [...earlierFrom(leg, candidates, legInstant).map((j) => j.naturalKey), leg.naturalKey];
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
    (j) => !j.deletedAt && maySee(j, seesHidden) && !Number.isNaN(Date.parse(j.scheduledDeparture)),
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
