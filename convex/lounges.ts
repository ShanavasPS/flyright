import { ConvexError, v } from 'convex/values';

import { query } from './_generated/server';
import { isAirportCode, MAX_AIRPORTS, type LoungeRecord } from './loungeShared';

/** The lounge directory for the airports on a trip (docs/lounges.md).
 * Public data: no account needed, and only airport codes arrive. An
 * airport with no rows answers an empty list, which hides every lounge
 * surface — so deleting rows is also how a wrong entry is pulled. */
export const atAirports = query({
  args: { airports: v.array(v.string()) },
  handler: async (ctx, { airports }): Promise<LoungeRecord[]> => {
    const codes = [...new Set(airports)];
    if (codes.length > MAX_AIRPORTS || !codes.every(isAirportCode)) throw new ConvexError('Invalid airports.');
    const rows = await Promise.all(
      codes.map((airport) => ctx.db.query('lounges').withIndex('by_airport', (q) => q.eq('airport', airport)).collect()),
    );
    return rows.flat().map(({ _id, _creationTime, ...lounge }) => lounge);
  },
});
