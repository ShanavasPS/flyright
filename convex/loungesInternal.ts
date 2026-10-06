import { ConvexError, v } from 'convex/values';

import { internalMutation } from './_generated/server';
import { isAirportCode, loungeProblem, loungeValidator } from './loungeShared';

/** Replaces one airport's lounges with the checked list from
 * scripts/lounges/directory.json (run by scripts/lounges/seed.mjs). An
 * empty list removes the airport. Internal: only the CLI can write. */
export const replaceAirport = internalMutation({
  args: { airport: v.string(), lounges: v.array(loungeValidator) },
  handler: async (ctx, { airport, lounges }) => {
    if (!isAirportCode(airport)) throw new ConvexError('Invalid airport.');
    for (const lounge of lounges) {
      if (lounge.airport !== airport) throw new ConvexError(`${lounge.loungeId} is not at ${airport}.`);
      const problem = loungeProblem(lounge);
      if (problem) throw new ConvexError(problem);
    }
    const old = await ctx.db.query('lounges').withIndex('by_airport', (q) => q.eq('airport', airport)).collect();
    for (const row of old) await ctx.db.delete(row._id);
    for (const lounge of lounges) await ctx.db.insert('lounges', lounge);
    return { airport, removed: old.length, added: lounges.length };
  },
});
