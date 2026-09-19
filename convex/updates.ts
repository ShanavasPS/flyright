import { limit, HOUR } from './abuse';
import { requireFileOwner, deleteOwnedFile, ownedFileUrl } from './fileOwnership';
import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { maySee } from './audience';
import { activeSessionForKey, journeyForKey, profileFor } from './liveHelpers';
import { stageIndex } from './liveShared';
import { blockedBetween } from './safetyHelpers';
import { safeAvatar } from './profileShared';
import { likerRelation, placeFor, sortLikers, UPDATE_TEXT_MAX, updateWindowOpen } from './updatesShared';

/** Trip updates: what a traveller shares from inside a trip, for the people
 * who follow them. Posting is the owner's; reading rides along on the same
 * payloads the follower surfaces already receive (live.following,
 * circle.person, circle.trip, live.byToken), each of which has already
 * decided the viewer may see the trip — so the audience rule is checked
 * once, where the trip is, never again per update. */

export const PRIVATE_TRIP = 'PRIVATE_TRIP';
export const WINDOW_CLOSED = 'WINDOW_CLOSED';

/** One update as a follower reads it. `reacted` is the viewer's own heart;
 * the count is everyone's. */
async function publicUpdate(ctx: QueryCtx | MutationCtx, row: Doc<'tripUpdates'>, viewerId: string | null) {
  return {
    updateId: row._id,
    text: row.text,
    photoUrl: await ownedFileUrl(ctx, row.userId, row.storageId),
    width: row.width,
    height: row.height,
    stage: row.stage,
    place: row.place,
    createdAt: row.createdAt,
    reactions: row.reactedBy.length,
    reacted: viewerId ? row.reactedBy.includes(viewerId) : false,
  };
}

export type PublicUpdate = Awaited<ReturnType<typeof publicUpdate>>;

/** The updates on one trip — or, given several keys, on the legs of one
 * itinerary (itinerary.itineraryKeys), merged. */
async function rowsFor(ctx: QueryCtx | MutationCtx, ownerId: string, journeyKey: string | string[]) {
  const rows = [];
  for (const key of Array.isArray(journeyKey) ? journeyKey : [journeyKey]) {
    rows.push(
      ...(await ctx.db
        .query('tripUpdates')
        .withIndex('by_user_key', (q) => q.eq('userId', ownerId).eq('journeyKey', key))
        .collect()),
    );
  }
  // Newest first: the latest word from the traveller is the one a follower
  // opened the page for.
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows;
}

/** Every update on one trip, newest first. The caller has already checked
 * the viewer may see the trip. */
export async function updatesFor(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  journeyKey: string | string[],
  viewerId: string | null,
): Promise<PublicUpdate[]> {
  const rows = await rowsFor(ctx, ownerId, journeyKey);
  return Promise.all(rows.map((row) => publicUpdate(ctx, row, viewerId)));
}

/** The newest update on one trip and how many there are — what the home
 * screen's pass shows beside the flight. */
export async function latestUpdate(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  journeyKey: string | string[],
  viewerId: string | null,
): Promise<{ latest: PublicUpdate; count: number } | null> {
  const rows = await rowsFor(ctx, ownerId, journeyKey);
  if (!rows.length) return null;
  return { latest: await publicUpdate(ctx, rows[0]!, viewerId), count: rows.length };
}

/** Whether a stored file is still shown by a journal photo or an update
 * other than `except` — the two rows share bytes, so a delete of either
 * must leave the file for the other. */
export async function storageInUse(
  ctx: MutationCtx,
  storageId: Id<'_storage'>,
  except: { photo?: Id<'tripPhotos'>; update?: Id<'tripUpdates'> } = {},
): Promise<boolean> {
  const photos = await ctx.db
    .query('tripPhotos')
    .withIndex('by_storage', (q) => q.eq('storageId', storageId))
    .collect();
  if (photos.some((p) => p._id !== except.photo && !p.deletedAt)) return true;
  const updates = await ctx.db
    .query('tripUpdates')
    .withIndex('by_storage', (q) => q.eq('storageId', storageId))
    .collect();
  return updates.some((u) => u._id !== except.update);
}

/** One person behind a heart, as the owner's "Liked by" list shows them. */
type Liker = {
  userId: string;
  name: string;
  imageUrl: string | null;
  relation: ReturnType<typeof likerRelation>;
  at: string | null;
};

/** OWNER — the updates on one of my trips, with who reacted, so the
 * traveller sees the hearts as people rather than a number: `reactedBy`
 * (names, what installs before the "Liked by" list read) and `likers`
 * (face, name, how they know me, when), newest heart first. */
export const mine = query({
  args: { journeyKey: v.string() },
  handler: async (ctx, { journeyKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const me = identity.subject;
    const rows = await rowsFor(ctx, me, journeyKey);
    const people = new Map<string, Omit<Liker, 'at'>>();
    const personFor = async (userId: string) => {
      const known = people.get(userId);
      if (known) return known;
      const profile = await profileFor(ctx, userId);
      const seat = await ctx.db
        .query('circle')
        .withIndex('by_owner_member', (q) => q.eq('ownerId', me).eq('memberId', userId))
        .unique();
      const theirs = await ctx.db
        .query('circle')
        .withIndex('by_owner_member', (q) => q.eq('ownerId', userId).eq('memberId', me))
        .unique();
      const person = {
        userId,
        name: profile?.name ?? 'Someone',
        imageUrl: safeAvatar(profile?.imageUrl ?? null),
        relation: likerRelation(seat, !!theirs),
      };
      people.set(userId, person);
      return person;
    };
    const out = [];
    for (const row of rows) {
      const likers: Liker[] = [];
      for (const userId of row.reactedBy) {
        likers.push({ ...(await personFor(userId)), at: row.reactedAt?.[userId] ?? null });
      }
      out.push({
        ...(await publicUpdate(ctx, row, me)),
        reactedBy: likers.map((l) => l.name),
        likers: sortLikers(likers),
      });
    }
    return out;
  },
});

/** OWNER — post an update on one of my trips. The photo, if any, was
 * uploaded first (photos.generateUploadUrl) and filed as a journal photo on
 * the device, so `storageId` is the same file that row will push. The
 * context (stage, place) is stamped here: the device's own travel-day
 * stage — the same taps the live session is built from, and fresher than
 * the session's copy of them — with the session, then the timetable, as
 * the fallbacks. Only a known stage key is accepted. */
export const post = mutation({
  args: {
    journeyKey: v.string(),
    text: v.string(),
    storageId: v.union(v.id('_storage'), v.null()),
    photoId: v.union(v.string(), v.null()),
    width: v.union(v.number(), v.null()),
    height: v.union(v.number(), v.null()),
    stage: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { journeyKey, text, storageId, photoId, width, height, stage: reported }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const me = identity.subject;
    if (storageId) await requireFileOwner(ctx, me, storageId);
    await limit(ctx, `trip-update:${me}`, 30, HOUR);
    const journey = await journeyForKey(ctx, me, journeyKey);
    if (!journey) throw new ConvexError('Trip not found');
    // An "Only me" trip has nobody to post to; the client hides the composer,
    // and this is the rule behind it.
    if (journey.privateTrip) throw new ConvexError(PRIVATE_TRIP);
    const body = text.trim().slice(0, UPDATE_TEXT_MAX);
    if (!body && !storageId) throw new ConvexError('Nothing to post');
    const now = Date.now();
    const session = await activeSessionForKey(ctx, me, journeyKey);
    const landedAt = session?.stageTimes.landed ?? session?.actualArrival ?? null;
    if (!updateWindowOpen(journey, now, landedAt)) throw new ConvexError(WINDOW_CLOSED);
    const stage =
      (reported && stageIndex(reported) >= 0 ? reported : null) ?? session?.currentStage ?? null;
    return ctx.db.insert('tripUpdates', {
      userId: me,
      journeyKey,
      text: body,
      storageId,
      photoId,
      width,
      height,
      stage,
      place: placeFor(journey, stage, now),
      reactedBy: [],
      createdAt: new Date(now).toISOString(),
    });
  },
});

/** OWNER — take an update down. The journal photo it was filed with stays
 * (that is the traveller's own record), and so do its bytes while that row
 * still shows them. */
export const remove = mutation({
  args: { updateId: v.id('tripUpdates') },
  handler: async (ctx, { updateId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const row = await ctx.db.get(updateId);
    if (!row || row.userId !== identity.subject) return;
    if (row.storageId && !(await storageInUse(ctx, row.storageId, { update: row._id }))) {
      await deleteOwnedFile(ctx, identity.subject, row.storageId);
    }
    await ctx.db.delete(row._id);
  },
});

/** FOLLOWER — toggle my heart on somebody's update. Allowed to anyone the
 * trip is shown to: a circle member the trip admits, or someone following
 * its live session through the shared link. Never the owner. */
export const react = mutation({
  args: { updateId: v.id('tripUpdates') },
  handler: async (ctx, { updateId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const me = identity.subject;
    const row = await ctx.db.get(updateId);
    if (!row || row.userId === me) return;
    if (!(await maySeeUpdate(ctx, row, me))) return;
    const had = row.reactedBy.includes(me);
    const reactedBy = had ? row.reactedBy.filter((id) => id !== me) : [...row.reactedBy, me];
    const rest = Object.fromEntries(Object.entries(row.reactedAt ?? {}).filter(([id]) => id !== me));
    const reactedAt = had ? rest : { ...rest, [me]: new Date().toISOString() };
    await ctx.db.patch(row._id, { reactedBy, reactedAt });
  },
});

async function maySeeUpdate(ctx: MutationCtx, row: Doc<'tripUpdates'>, viewerId: string) {
  if (await blockedBetween(ctx, row.userId, viewerId)) return false;
  const journey = await journeyForKey(ctx, row.userId, row.journeyKey);
  if (!journey) return false;
  const seat = await ctx.db
    .query('circle')
    .withIndex('by_owner_member', (q) => q.eq('ownerId', row.userId).eq('memberId', viewerId))
    .unique();
  if (seat && maySee(journey, !!seat.close)) return true;
  // Not in the circle: following this one trip through its link counts.
  const sessions = await ctx.db
    .query('liveSessions')
    .withIndex('by_user_key', (q) => q.eq('userId', row.userId).eq('naturalKey', row.journeyKey))
    .collect();
  for (const session of sessions) {
    const follow = await ctx.db
      .query('follows')
      .withIndex('by_session_follower', (q) => q.eq('sessionId', session._id).eq('followerId', viewerId))
      .unique();
    if (follow) return true;
  }
  return false;
}

/** How far back the Friends tab's feed reaches: an update window is the day
 * of the flight until a day after landing, so two days holds every post
 * still worth a heart. */
const FEED_MS = 48 * HOUR;
const FEED_MAX = 30;

/** FOLLOWER — the Friends tab's "Latest from trips": recent posts from
 * everyone whose trips I follow, newest first, each with who posted it and
 * the flight it came from. The circle's audience rule is checked per trip
 * (a close-circle trip only for close members, never a private one), and a
 * block in either direction hides the person entirely. */
export const feed = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const me = identity.subject;
    const cutoff = new Date(Date.now() - FEED_MS).toISOString();
    const seats = await ctx.db
      .query('circle')
      .withIndex('by_member', (q) => q.eq('memberId', me))
      .collect();
    const out = [];
    for (const seat of seats) {
      if (await blockedBetween(ctx, seat.ownerId, me)) continue;
      const rows = (
        await ctx.db
          .query('tripUpdates')
          .withIndex('by_user', (q) => q.eq('userId', seat.ownerId))
          .collect()
      ).filter((row) => row.createdAt >= cutoff);
      if (!rows.length) continue;
      const profile = await profileFor(ctx, seat.ownerId);
      const owner = {
        userId: seat.ownerId,
        name: profile?.name ?? 'A traveler',
        imageUrl: safeAvatar(profile?.imageUrl ?? null),
      };
      const journeys = new Map<string, Doc<'journeys'> | null>();
      for (const row of rows) {
        if (!journeys.has(row.journeyKey)) {
          journeys.set(row.journeyKey, await journeyForKey(ctx, seat.ownerId, row.journeyKey));
        }
        const journey = journeys.get(row.journeyKey);
        if (!journey || !maySee(journey, !!seat.close)) continue;
        out.push({
          ...(await publicUpdate(ctx, row, me)),
          owner,
          trip: { journeyId: journey._id, number: journey.number, fromCode: journey.fromCode, toCode: journey.toCode },
        });
      }
    }
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return out.slice(0, FEED_MAX);
  },
});
