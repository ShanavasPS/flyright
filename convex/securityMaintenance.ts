import { internalQuery } from './_generated/server';
import { fileOwner } from './fileOwnership';

/** Deployment check without exporting names, addresses, tokens or photo URLs. */
export const inventory = internalQuery({
  args: {},
  handler: async ctx => {
    const profiles = await ctx.db.query('profiles').take(10001);
    const photos = await ctx.db.query('tripPhotos').take(10001);
    let legacyPhotos = 0, conflictingPhotos = 0;
    for (const row of photos) {
      if (!row.storageId || row.deletedAt) continue;
      const owner = await fileOwner(ctx, row.storageId);
      if (!owner) legacyPhotos++;
      else if (owner.userId !== row.userId) conflictingPhotos++;
    }
    return { sampledProfiles: profiles.length, verifiedEmails: profiles.filter(p => p.emailVerified && p.email).length, sampledPhotos: photos.length, legacyPhotos, conflictingPhotos, truncated: profiles.length > 10000 || photos.length > 10000 };
  },
});
