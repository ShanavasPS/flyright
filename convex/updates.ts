import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { maySee } from './audience';
import { activeSessionForKey, journeyForKey, travelerName } from './liveHelpers';
import { stageIndex } from './liveShared';
import { placeFor, UPDATE_TEXT_MAX, updateWindowOpen } from './updatesShared';

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
    photoUrl: row.storageId ? await ctx.storage.getUrl(row.storageId) : null,
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

async function rowsFor(ctx: QueryCtx | MutationCtx, ownerId: string, journeyKey: string) {
  const rows = await ctx.db
    .query('tripUpdates')
    .withIndex('by_user_key', (q) => q.eq('userId', ownerId).eq('journeyKey', journeyKey))
    .collect();
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
  journeyKey: string,
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
  journeyKey: string,
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

/** OWNER — the updates on one of my trips, with who reacted by name, so the
 * traveller sees the hearts as people rather than a number. */
export const mine = query({
  args: { journeyKey: v.string() },
  handler: async (ctx, { journeyKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const rows = await rowsFor(ctx, identity.subject, journeyKey);
    const names = new Map<string, string>();
    const out = [];
    for (const row of rows) {
      const reactedBy = [];
      for (const userId of row.reactedBy) {
        if (!names.has(userId)) names.set(userId, (await travelerName(ctx, userId)) ?? 'Someone');
        reactedBy.push(names.get(userId)!);
      }
      out.push({ ...(await publicUpdate(ctx, row, identity.subject)), reactedBy });
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
      await ctx.storage.delete(row.storageId).catch(() => {});
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
    const reactedBy = row.reactedBy.includes(me)
      ? row.reactedBy.filter((id) => id !== me)
      : [...row.reactedBy, me];
    await ctx.db.patch(row._id, { reactedBy });
  },
});

async function maySeeUpdate(ctx: MutationCtx, row: Doc<'tripUpdates'>, viewerId: string) {
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
