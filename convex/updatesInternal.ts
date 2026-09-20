import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalAction, internalQuery } from './_generated/server';
import { profileFor } from './liveHelpers';
import { sendFollowerPush } from './onesignal';

/** The push a reply earns its traveller.
 *
 * A heart is silent — a circle full of them would be noise, and the owner
 * sees the count when they look. A comment is somebody speaking to them, so
 * it is told every time. Only ever to the post's owner: the thread's other
 * readers are not subscribed to each other.
 */
export const commentTargets = internalQuery({
  args: { commentId: v.id('updateComments') },
  handler: async (ctx, { commentId }) => {
    const row = await ctx.db.get(commentId);
    if (!row || row.authorId === row.ownerId) return null;
    const post = await ctx.db.get(row.updateId);
    if (!post) return null;
    const author = await profileFor(ctx, row.authorId);
    return {
      ownerId: row.ownerId,
      authorName: author?.name ?? 'Someone',
      text: row.text,
      journeyKey: post.journeyKey,
    };
  },
});

export const notifyComment = internalAction({
  args: { commentId: v.id('updateComments') },
  handler: async (ctx, { commentId }) => {
    const target = await ctx.runQuery(internal.updatesInternal.commentTargets, { commentId });
    if (!target) return;
    // The traveller's own trip page, where their post and its replies are.
    await sendFollowerPush(
      [target.ownerId],
      `${target.authorName} replied`,
      target.text.length > 120 ? `${target.text.slice(0, 117)}…` : target.text,
      `https://getflyright.com/journey/${encodeURIComponent(target.journeyKey)}`,
    );
  },
});
