import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/** Cloud mirror of the local SQLite `journeys` table. Local stays the source
 * of truth; rows merge by last-write-wins on `updatedAt`. Timestamps are the
 * same ISO strings the app stores, so LWW comparisons are byte-identical on
 * both sides — no parse/format round trips. Deletes are tombstones
 * (`deletedAt`), never row removal, so they propagate across devices. */
export default defineSchema({
  journeys: defineTable({
    /** Clerk user id — always stamped server-side from the JWT. */
    userId: v.string(),
    /** The local row's natural key, e.g. 'AY123-2026-08-20'. */
    naturalKey: v.string(),
    mode: v.string(),
    carrier: v.string(),
    carrierCountry: v.string(),
    number: v.string(),
    fromCode: v.string(),
    fromCountry: v.string(),
    toCode: v.string(),
    toCountry: v.string(),
    distanceKm: v.number(),
    scheduledDeparture: v.string(),
    scheduledArrival: v.string(),
    ticketPriceAmount: v.union(v.number(), v.null()),
    ticketPriceCurrency: v.union(v.string(), v.null()),
    source: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
    deletedAt: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_key', ['userId', 'naturalKey']),
});
