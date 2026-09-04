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
    /** The traveler's trip notes and when they last changed. Optional: rows
     * synced before notes existed (and pushes from older clients) omit them. */
    notes: v.optional(v.union(v.string(), v.null())),
    notesUpdatedAt: v.optional(v.union(v.string(), v.null())),
    /** 1–5 star rating, booking reference and seat — same optionality. */
    rating: v.optional(v.union(v.number(), v.null())),
    bookingReference: v.optional(v.union(v.string(), v.null())),
    seat: v.optional(v.union(v.string(), v.null())),
    source: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
    deletedAt: v.union(v.string(), v.null()),
    /** The pending T−24h circle heads-up for this trip (see
     * circleInternal.headsUp). Optional: rows synced before circles existed
     * have none. */
    headsUpScheduledId: v.optional(v.union(v.id('_scheduled_functions'), v.null())),
    /** Set once the heads-up went out — a later departure edit must not
     * re-announce the same trip. */
    headsUpSentAt: v.optional(v.union(v.string(), v.null())),
  })
    .index('by_user', ['userId'])
    .index('by_user_key', ['userId', 'naturalKey']),

  /** Cloud mirror of the local `trip_photos` table. The image itself lives
   * in Convex file storage (storageId); rows merge last-write-wins on
   * updatedAt like journeys, and a tombstone push deletes the stored file. */
  tripPhotos: defineTable({
    userId: v.string(),
    /** The journey's natural key (journeys.naturalKey). */
    journeyKey: v.string(),
    /** The local row id — the photo's natural key. */
    photoId: v.string(),
    storageId: v.union(v.id('_storage'), v.null()),
    width: v.union(v.number(), v.null()),
    height: v.union(v.number(), v.null()),
    createdAt: v.string(),
    updatedAt: v.string(),
    deletedAt: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_photo', ['userId', 'photoId']),

  /** One live travel-day session per shared trip. Standalone with a
   * denormalized flight snapshot: the public token query must never join
   * into the owner-scoped journeys mirror, and the session keeps working if
   * the journey row is edited mid-flight. The unguessable shareToken is the
   * ONLY public handle — naturalKey is guessable and never leaves the
   * server unauthenticated (see liveShared.toPublicSession). */
  liveSessions: defineTable({
    userId: v.string(),
    naturalKey: v.string(),
    status: v.union(v.literal('active'), v.literal('closed'), v.literal('canceled')),

    // Flight snapshot (public-safe)
    carrier: v.string(),
    number: v.string(),
    fromCode: v.string(),
    toCode: v.string(),
    scheduledDeparture: v.string(),
    scheduledArrival: v.string(),

    // Stage machine — same stage keys as src/services/travel-day.ts
    currentStage: v.union(v.string(), v.null()),
    stageTimes: v.record(v.string(), v.string()),

    // Flight-driven facts (from the poll chain)
    flightStatus: v.union(v.string(), v.null()),
    delayMinutes: v.union(v.number(), v.null()),
    gate: v.union(v.string(), v.null()),
    terminal: v.union(v.string(), v.null()),
    baggageBelt: v.union(v.string(), v.null()),
    estimatedDeparture: v.union(v.string(), v.null()),
    actualDeparture: v.union(v.string(), v.null()),
    estimatedArrival: v.union(v.string(), v.null()),
    actualArrival: v.union(v.string(), v.null()),
    lastCheckedAt: v.union(v.string(), v.null()),

    /** The traveler device's Live Activity id — lets the poll chain push
     * lock-screen updates. Never public. */
    activityId: v.union(v.string(), v.null()),

    shareToken: v.union(v.string(), v.null()),
    expiresAt: v.string(),

    // Push bookkeeping — a stage pushes to followers at most once.
    notifiedStages: v.record(v.string(), v.boolean()),
    notifiedDelayBucket: v.union(v.number(), v.null()),
    notifiedGate: v.union(v.string(), v.null()),
    pendingNotify: v.boolean(),
    pollScheduledId: v.union(v.id('_scheduled_functions'), v.null()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index('by_user', ['userId'])
    .index('by_user_key', ['userId', 'naturalKey'])
    .index('by_token', ['shareToken'])
    .index('by_status', ['status']),

  follows: defineTable({
    sessionId: v.id('liveSessions'),
    /** Denormalized traveler id → cheap purge on account deletion. */
    ownerId: v.string(),
    followerId: v.string(),
    muted: v.boolean(),
    createdAt: v.string(),
  })
    .index('by_session', ['sessionId'])
    .index('by_follower', ['followerId'])
    .index('by_session_follower', ['sessionId', 'followerId'])
    .index('by_owner', ['ownerId']),

  /** Find My-style persistent sharing: `memberId` follows every trip
   * `ownerId` takes, present and future. One row per direction — a couple
   * sharing both ways has two rows. Materialized into `follows` per session
   * (on accept, on session start, on the T−24h heads-up), so the fan-out
   * path stays one table wide. */
  circle: defineTable({
    ownerId: v.string(),
    memberId: v.string(),
    /** Member-side: still see the trip, skip the pushes. */
    muted: v.boolean(),
    createdAt: v.string(),
  })
    .index('by_owner', ['ownerId'])
    .index('by_member', ['memberId'])
    .index('by_owner_member', ['ownerId', 'memberId']),

  /** Personal invite links (getflyright.com/i/<token>). Time-limited (7 days,
   * long enough to install the app and come back) and use-capped: anyone
   * holding the link joins the owner's circle, so a leaked link stays a
   * bounded problem. */
  circleInvites: defineTable({
    ownerId: v.string(),
    token: v.string(),
    uses: v.number(),
    expiresAt: v.string(),
    createdAt: v.string(),
  })
    .index('by_token', ['token'])
    .index('by_owner', ['ownerId']),

  /** Display names for "Sam is through security" — fed by the Clerk webhook
   * (user.created/updated); Convex JWTs only carry the subject. */
  /** Settings → Contact support. One thread per conversation; the token is
   * the plus-address (support+<token>@getflyright.com) that routes email
   * replies back into the thread via the support-mail Email Worker →
   * http.ts /support-inbound. userId is null for anonymous senders, who get
   * the email conversation but no in-app history. */
  supportThreads: defineTable({
    userId: v.union(v.string(), v.null()),
    /** Reply address: the Clerk identity's email, or what the user typed. */
    email: v.string(),
    token: v.string(),
    subject: v.string(),
    platform: v.string(),
    appVersion: v.string(),
    createdAt: v.string(),
    lastMessageAt: v.string(),
    lastPreview: v.string(),
    lastDirection: v.union(v.literal('in'), v.literal('out')),
    /** Set when support replies; cleared by support.markRead. */
    unreadForUser: v.boolean(),
    /** Message-ID of the first notification email — later ones reference it
     * so the support inbox threads the conversation. */
    rootEmailId: v.union(v.string(), v.null()),
  })
    .index('by_user_last', ['userId', 'lastMessageAt'])
    .index('by_token', ['token'])
    .index('by_email_created', ['email', 'createdAt']),

  /** 'in' = traveler → FlyRight (from the app, or an email reply);
   * 'out' = FlyRight → traveler (always an email reply from the inbox).
   * deliveredAt tracks the app→inbox email for 'in'/'app' rows and stays null
   * on failure so support:retryUndelivered can resend. */
  supportMessages: defineTable({
    threadId: v.id('supportThreads'),
    direction: v.union(v.literal('in'), v.literal('out')),
    source: v.union(v.literal('app'), v.literal('email')),
    body: v.string(),
    createdAt: v.string(),
    deliveredAt: v.union(v.string(), v.null()),
    deliveryError: v.union(v.string(), v.null()),
    emailId: v.union(v.string(), v.null()),
  })
    .index('by_thread', ['threadId', 'createdAt'])
    .index('by_delivered', ['deliveredAt']),

  profiles: defineTable({
    userId: v.string(),
    name: v.string(),
    imageUrl: v.union(v.string(), v.null()),
    updatedAt: v.string(),
  }).index('by_user', ['userId']),

  /** Server-side mirror of the RevenueCat 'Owed Pro' entitlement, fed by the
   * RC webhook (http.ts /rc-webhook) — the client's SDK state can't be
   * trusted for server-enforced limits like the free circle size. One row per
   * RC app_user_id (Clerk ids and RC anonymous ids alike, since RC events
   * list every alias). */
  entitlements: defineTable({
    userId: v.string(),
    /** ISO instant Pro lapses; null = never had it or revoked. Lifetime
     * purchases store a far-future date. */
    proUntil: v.union(v.string(), v.null()),
    /** Last RC event type that touched this row, for debugging. */
    source: v.string(),
    updatedAt: v.string(),
  }).index('by_user', ['userId']),

  /** Daily meter for the metered flight-status lookups — one row per caller
   * per UTC day, keyed `user:<clerkId>:<day>` or `ip:<hash>:<day>` (see
   * lookups.ts / lookupShared.ts). Rows for past days are dead weight; a
   * cron may sweep them later. */
  lookupQuota: defineTable({
    key: v.string(),
    day: v.string(),
    count: v.number(),
    updatedAt: v.string(),
  }).index('by_key', ['key']),
});
