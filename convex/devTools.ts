import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalAction, internalMutation } from './_generated/server';
import { armHeadsUp, createSession, materializeCircleFollows } from './liveHelpers';
import { sendFollowerPush } from './onesignal';
import { safeAvatar } from './profileShared';
import { firstNameKey, searchKey } from './circleShared';

/**
 * Dev-only knobs, callable from the CLI alone (internal functions never
 * reach a client): `npx convex run devTools:patchLiveSession '{...}'`.
 *
 * Puts a live session into an arbitrary state — mid-air with a delay, back
 * to "not yet departed" — so follower surfaces can be screenshotted and
 * reviewed without waiting for a real flight to reach that moment. The
 * poller only ever moves a session forward (applyFlightFacts never nulls a
 * fact or regresses a stage), which is right for production and useless for
 * putting a landed demo flight back in the sky.
 */
export const patchLiveSession = internalMutation({
  args: {
    sessionId: v.id('liveSessions'),
    patch: v.record(v.string(), v.any()),
  },
  handler: async (ctx, { sessionId, patch }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error('No such session');
    await ctx.db.patch(sessionId, { ...patch, updatedAt: new Date().toISOString() });
    return await ctx.db.get(sessionId);
  },
});

/** Grant or revoke Pro for a user on this deployment — `npx convex run
 * devTools:setPro '{"userId":"user_x","proUntil":"2099-01-01T00:00:00Z"}'`
 * (null revokes). Production Pro comes from the RevenueCat webhook only;
 * this exists so the Pro badge can be seen on a seeded dev account. */
export const setPro = internalMutation({
  args: { userId: v.string(), proUntil: v.union(v.string(), v.null()) },
  handler: async (ctx, { userId, proUntil }) => {
    const row = await ctx.db
      .query('entitlements')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    const patch = { proUntil, source: 'devTools', updatedAt: new Date().toISOString() };
    if (row) await ctx.db.patch(row._id, patch);
    else await ctx.db.insert('entitlements', { userId, ...patch });
    return { userId, proUntil };
  },
});

/** Insert a journey for a seeded dev traveller — `npx convex run
 * devTools:insertJourney '{"userId":"user_dev_sam","number":"BA283","fromCode":"LHR",...}'`
 * — so connecting itineraries can be shown to a follower on the simulator
 * without a second device adding trips. Dev only; never callable by a client. */
export const insertJourney = internalMutation({
  args: {
    userId: v.string(),
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
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const naturalKey = `${args.number}-${args.scheduledDeparture.slice(0, 10)}`;
    const id = await ctx.db.insert('journeys', {
      ...args,
      naturalKey,
      mode: 'flight',
      ticketPriceAmount: null,
      ticketPriceCurrency: null,
      source: 'lookup',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    // What journeys.push does for a real trip: the T−24h heads-up, which for
    // a same-day leg runs at once and opens the live session the follower
    // surfaces read. Without it a seeded leg has no timeline to show.
    const row = await ctx.db.get(id);
    if (row) await armHeadsUp(ctx, row);
    return { id, naturalKey };
  },
});

/** Put a text postcard on a real dev user's trip, backdated — so the "You"
 * tile on Updates can be seen after a trip stops taking posts without
 * waiting a day for one to close. `npx convex run devTools:insertUpdate
 * '{"userId":"user_x","journeyKey":"AY1337-2026-09-21","text":"…","minutesAgo":90,"stage":"landed","place":"LHR"}'`
 * Dev only; never callable by a client. */
export const insertUpdate = internalMutation({
  args: {
    userId: v.string(),
    journeyKey: v.string(),
    text: v.string(),
    minutesAgo: v.number(),
    stage: v.optional(v.string()),
    place: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const at = new Date(Date.now() - args.minutesAgo * 60_000).toISOString();
    return await ctx.db.insert('tripUpdates', {
      userId: args.userId,
      journeyKey: args.journeyKey,
      text: args.text,
      storageId: null,
      photoId: null,
      width: null,
      height: null,
      stage: args.stage ?? null,
      place: args.place ?? null,
      reactedBy: [],
      reactedAt: {},
      createdAt: at,
    });
  },
});

/** Patch a dev journey — move a seeded connecting leg into the next hours so
 * the "under way" block can be screenshotted. Dev only. */
export const patchJourney = internalMutation({
  args: { id: v.id('journeys'), patch: v.record(v.string(), v.any()) },
  handler: async (ctx, { id, patch }) => {
    await ctx.db.patch(id, { ...patch, updatedAt: new Date().toISOString() });
    const row = await ctx.db.get(id);
    if (row) await armHeadsUp(ctx, row);
    return row;
  },
});

/** Drop cached provider answers by key — `npx convex run devTools:purgeFlightFacts
 * '{"keys":["QR516:2026-09-19","QR516:2026-09-19:inb"]}'`. For an answer that
 * was normalized wrongly and would otherwise be served until it expires. */
export const purgeFlightFacts = internalMutation({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }) => {
    const purged: string[] = [];
    for (const key of keys) {
      const row = await ctx.db
        .query('flightFacts')
        .withIndex('by_key', (q) => q.eq('key', key))
        .unique();
      if (!row) continue;
      await ctx.db.delete(row._id);
      purged.push(key);
    }
    return { purged };
  },
});

/** Arm (or re-arm) the heads-up for a journey — opens its live session at
 * once when departure is within a day. Dev only. */
export const armJourney = internalMutation({
  args: { id: v.id('journeys') },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error('No such journey');
    await armHeadsUp(ctx, row);
    return await ctx.db.get(id);
  },
});

/** Stock people around a demo account, for the website's People captures —
 * `npx convex run devTools:seedDemoCircle '{...}'`. Each person is an
 * existing Clerk user (their profile row comes from the webhook; letter
 * avatars are not wanted in demos, so photos are set in Clerk first). The
 * relationship and the trip put their People row in one state each:
 *
 * - `follow`: the demo account follows them (they are the circle owner).
 *   With `session`, a live session at that stage, hours from now as given;
 *   without one, an upcoming trip for the next-trip row.
 * - `follower`: they follow the demo account (Followers tab).
 * - `mutual`: both.
 * - `request`: they opened the demo account's invite link and wait
 *   (Followers → Requests).
 *
 * Idempotent on the (owner, member) pairs and the journeys' natural keys.
 * Dev and demo accounts only — never point this at a real person. */
export const seedDemoCircle = internalMutation({
  args: {
    demoUserId: v.string(),
    people: v.array(
      v.object({
        userId: v.string(),
        /** Writes the profile row too — for a synthetic person with no Clerk
         * account behind them (dev deployments). */
        name: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
        relation: v.union(v.literal('follow'), v.literal('follower'), v.literal('mutual'), v.literal('request')),
        close: v.optional(v.boolean()),
        trip: v.optional(
          v.object({
            carrier: v.string(),
            carrierCountry: v.string(),
            number: v.string(),
            fromCode: v.string(),
            fromCountry: v.string(),
            toCode: v.string(),
            toCountry: v.string(),
            distanceKm: v.number(),
            /** Departure, in hours from now (negative = already left). */
            departsInHours: v.number(),
            durationHours: v.number(),
            /** Opens a live session at this stage, stamped back from now. */
            stage: v.optional(v.string()),
            gate: v.optional(v.string()),
            terminal: v.optional(v.string()),
            delayMinutes: v.optional(v.number()),
            baggageBelt: v.optional(v.string()),
            /** Written as a hand-added trip, so no poll is scheduled: a real
             * flight number would otherwise be looked up (quota) and the
             * provider's times would overwrite the staged ones. */
            manual: v.optional(v.boolean()),
            /** Postcards on this trip, for the viewer's Home feed. A photo is
             * a file stored and owned first (storeDemoPhoto). */
            posts: v.optional(
              v.array(
                v.object({
                  text: v.string(),
                  minutesAgo: v.number(),
                  storageId: v.optional(v.id('_storage')),
                  width: v.optional(v.number()),
                  height: v.optional(v.number()),
                  stage: v.optional(v.string()),
                  place: v.optional(v.string()),
                  /** Who gave it a heart (the viewer's id fills yours in). */
                  hearts: v.optional(v.array(v.string())),
                }),
              ),
            ),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, { demoUserId, people }) => {
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const out: string[] = [];

    const link = async (ownerId: string, memberId: string, close = false) => {
      const existing = await ctx.db
        .query('circle')
        .withIndex('by_owner_member', (q) => q.eq('ownerId', ownerId).eq('memberId', memberId))
        .unique();
      if (existing) return;
      await ctx.db.insert('circle', { ownerId, memberId, muted: false, close, createdAt: now });
      out.push(`circle ${ownerId} ← ${memberId}`);
    };

    for (const person of people) {
      if (person.name) {
        const profile = await ctx.db
          .query('profiles')
          .withIndex('by_user', (q) => q.eq('userId', person.userId))
          .unique();
        const fields = { name: person.name, imageUrl: person.imageUrl ?? null, updatedAt: now };
        if (profile) await ctx.db.patch(profile._id, fields);
        else await ctx.db.insert('profiles', { userId: person.userId, ...fields });
        out.push(`profile ${person.userId} ${person.name}`);
      }
      if (person.relation === 'follow' || person.relation === 'mutual') await link(person.userId, demoUserId, person.close);
      if (person.relation === 'follower' || person.relation === 'mutual') await link(demoUserId, person.userId, person.close);
      if (person.relation === 'request') {
        const pending = await ctx.db
          .query('circleRequests')
          .withIndex('by_pair', (q) => q.eq('fromUserId', person.userId).eq('toUserId', demoUserId))
          .collect();
        if (!pending.some((r) => r.status === 'pending')) {
          await ctx.db.insert('circleRequests', {
            fromUserId: person.userId,
            toUserId: demoUserId,
            kind: 'follow',
            status: 'pending',
            createdAt: now,
            respondedAt: null,
            viaLink: true,
          });
          out.push(`request ${person.userId} → ${demoUserId}`);
        }
      }

      const trip = person.trip;
      if (!trip) continue;
      const dep = new Date(nowMs + trip.departsInHours * 3_600_000);
      const arr = new Date(dep.getTime() + trip.durationHours * 3_600_000);
      const naturalKey = `${trip.number}-${dep.toISOString().slice(0, 10)}`;
      let journey = await ctx.db
        .query('journeys')
        .withIndex('by_user_key', (q) => q.eq('userId', person.userId).eq('naturalKey', naturalKey))
        .unique();
      if (!journey) {
        const id = await ctx.db.insert('journeys', {
          userId: person.userId,
          naturalKey,
          mode: 'flight',
          carrier: trip.carrier,
          carrierCountry: trip.carrierCountry,
          number: trip.number,
          fromCode: trip.fromCode,
          fromCountry: trip.fromCountry,
          toCode: trip.toCode,
          toCountry: trip.toCountry,
          distanceKm: trip.distanceKm,
          scheduledDeparture: dep.toISOString(),
          scheduledArrival: arr.toISOString(),
          ticketPriceAmount: null,
          ticketPriceCurrency: null,
          source: trip.manual ? 'manual' : 'lookup',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        journey = await ctx.db.get(id);
        out.push(`journey ${person.userId} ${naturalKey}`);
      }
      if (!journey) continue;

      for (const post of trip.posts ?? []) {
        const existing = await ctx.db
          .query('tripUpdates')
          .withIndex('by_user_key', (q) => q.eq('userId', person.userId).eq('journeyKey', naturalKey))
          .collect();
        if (existing.some((row) => row.text === post.text)) continue;
        const at = new Date(nowMs - post.minutesAgo * 60_000).toISOString();
        await ctx.db.insert('tripUpdates', {
          userId: person.userId,
          journeyKey: naturalKey,
          text: post.text,
          storageId: post.storageId ?? null,
          photoId: null,
          width: post.width ?? null,
          height: post.height ?? null,
          stage: post.stage ?? null,
          place: post.place ?? null,
          reactedBy: post.hearts ?? [],
          reactedAt: Object.fromEntries((post.hearts ?? []).map((id) => [id, at])),
          createdAt: at,
        });
        out.push(`post ${person.userId} ${naturalKey} "${post.text.slice(0, 24)}"`);
      }
      if (!trip.stage) continue;

      const active = await ctx.db
        .query('liveSessions')
        .withIndex('by_user_key', (q) => q.eq('userId', person.userId).eq('naturalKey', naturalKey))
        .collect();
      if (active.some((s) => s.status === 'active')) continue;

      // Stamp every stage up to the given one, spread over the last hours.
      const order = ['at_airport', 'checked_in', 'bag_dropped', 'security', 'boarded', 'departed', 'landed', 'bags_collected'];
      const upTo = order.indexOf(trip.stage);
      const stamps: Record<string, string> = {};
      order.slice(0, upTo + 1).forEach((stage, i) => {
        stamps[stage] = new Date(nowMs - (upTo + 1 - i) * 14 * 60_000).toISOString();
      });
      const created = await createSession(ctx, journey, { stage: trip.stage, stamps, activityId: null });
      const sessionId = created._id;
      const departed = upTo >= order.indexOf('departed');
      const landed = upTo >= order.indexOf('landed');
      await ctx.db.patch(sessionId, {
        gate: trip.gate ?? null,
        terminal: trip.terminal ?? null,
        delayMinutes: trip.delayMinutes ?? null,
        baggageBelt: trip.baggageBelt ?? null,
        flightStatus: landed ? 'landed' : departed ? 'active' : 'scheduled',
        actualDeparture: departed ? stamps.departed ?? null : null,
        actualArrival: landed ? stamps.landed ?? null : null,
        estimatedArrival: trip.delayMinutes && !landed ? new Date(arr.getTime() + trip.delayMinutes * 60_000).toISOString() : null,
        lastCheckedAt: now,
      });
      const session = await ctx.db.get(sessionId);
      if (session) await materializeCircleFollows(ctx, session);
      out.push(`session ${person.userId} ${naturalKey} @ ${trip.stage}`);
    }
    return out;
  },
});

/** Synthetic people made for store screenshots carry this prefix, and only
 * they can be reset or given files — so these tools can never touch a real
 * account's trips, posts or photos. */
const STORE_DEMO_PREFIX = 'store_demo_';

/** The production twin of the store profile (scripts/store-profile.json →
 * `prod`): four real Clerk accounts of Shanavas's, given over to screenshots
 * on 2026-09-21 so the profile can be shot from the App Store build — the
 * viewer and the three friends; nobody else is linked to them. Resetting
 * clears ALL of a friend's trips and postcards, so an id goes in here only
 * for an account that holds nothing else. */
const SCREENSHOT_ACCOUNTS = new Set([
  'user_3JKe1vlXldeZXFBDfZFWT38iB2U', // viewer (Maja)
  'user_3JKeCs5sEnomDdsnhFAwZXFOTap', // Noah
  'user_3JKiGbwVQ1j7kphfyM935IofArl', // Clara
  'user_3IVT71D76Z6UInrzIVv8tR7J5YN', // Tomas
]);

function assertStoreDemo(userId: string) {
  if (!userId.startsWith(STORE_DEMO_PREFIX) && !SCREENSHOT_ACCOUNTS.has(userId)) {
    throw new Error(`${userId} is not a ${STORE_DEMO_PREFIX}* person or a screenshot account`);
  }
}

/** Writes the store viewer's journal into the cloud under its `demo-*` keys
 * (the local seed's ids), so a phone signed in to the production twin pulls
 * the same nine trips a simulator gets from scripts/seed-demo-data.mjs. The
 * rows are the dev viewer's synced journal, re-anchored to now by
 * scripts/seed-store-profile.mjs. Replaces rows with the same key; heads-ups
 * are never armed, so nobody is told about a trip that isn't real. */
export const importDemoJourneys = internalMutation({
  args: { userId: v.string(), rows: v.array(v.record(v.string(), v.any())) },
  handler: async (ctx, { userId, rows }) => {
    assertStoreDemo(userId);
    const out: string[] = [];
    for (const row of rows) {
      const naturalKey = String(row.naturalKey);
      if (!naturalKey.startsWith('demo-')) throw new Error(`${naturalKey} is not a demo-* journal row`);
      const { _id, _creationTime, headsUpScheduledId, headsUpSentAt, ...fields } = row;
      const existing = await ctx.db
        .query('journeys')
        .withIndex('by_user_key', (q) => q.eq('userId', userId).eq('naturalKey', naturalKey))
        .unique();
      if (existing) await ctx.db.delete(existing._id);
      await ctx.db.insert('journeys', { ...(fields as Doc<'journeys'>), userId, naturalKey, deletedAt: null });
      out.push(`journey ${naturalKey}`);
    }
    return out;
  },
});

/** Stores a stock photo (images.unsplash.com only) as a file owned by a
 * store-demo person, for a postcard — `npx convex run
 * devTools:storeDemoPhoto '{"userId":"store_demo_…","url":"https://images.unsplash.com/…"}'`.
 * Returns the storage id to pass in seedDemoCircle's posts. */
export const storeDemoPhoto = internalAction({
  args: { userId: v.string(), url: v.string() },
  handler: async (ctx, { userId, url }): Promise<string> => {
    assertStoreDemo(userId);
    if (new URL(url).hostname !== 'images.unsplash.com') throw new Error('Stock photos come from images.unsplash.com');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    const blob = await res.blob();
    const storageId = await ctx.storage.store(blob);
    await ctx.runMutation(internal.devTools.ownDemoFile, { userId, storageId, size: blob.size });
    return storageId;
  },
});

export const ownDemoFile = internalMutation({
  args: { userId: v.string(), storageId: v.id('_storage'), size: v.number() },
  handler: async (ctx, { userId, storageId, size }) => {
    assertStoreDemo(userId);
    await ctx.db.insert('ownedFiles', { userId, storageId, size, createdAt: Date.now() });
  },
});

/** Clears what a store-screenshot run left behind, so the next run starts
 * from nothing and anchors every time to its own "now": the store-demo
 * people's trips, live sessions (and the follows they made), postcards and
 * their files, and the viewer's own `demo-*` journal rows (the local seed's
 * ids — a real account's keys are "AY1331-2026-09-21"), which would
 * otherwise sync back over a fresh seed with older times. Profiles and
 * circle rows stay: they are the saved profile. */
export const resetStoreDemo = internalMutation({
  args: { demoUserId: v.string(), people: v.array(v.string()) },
  handler: async (ctx, { demoUserId, people }) => {
    const out: string[] = [];
    for (const userId of people) {
      assertStoreDemo(userId);
      for (const session of await ctx.db.query('liveSessions').withIndex('by_user', (q) => q.eq('userId', userId)).collect()) {
        for (const f of await ctx.db.query('follows').withIndex('by_session', (q) => q.eq('sessionId', session._id)).collect()) {
          await ctx.db.delete(f._id);
        }
        await ctx.db.delete(session._id);
        out.push(`session ${userId} ${session.naturalKey}`);
      }
      for (const row of await ctx.db.query('tripUpdates').withIndex('by_user', (q) => q.eq('userId', userId)).collect()) {
        if (row.storageId) {
          for (const owned of await ctx.db.query('ownedFiles').withIndex('by_storage', (q) => q.eq('storageId', row.storageId!)).collect()) {
            await ctx.db.delete(owned._id);
          }
          await ctx.storage.delete(row.storageId);
        }
        await ctx.db.delete(row._id);
        out.push(`post ${userId}`);
      }
      for (const journey of await ctx.db.query('journeys').withIndex('by_user', (q) => q.eq('userId', userId)).collect()) {
        await ctx.db.delete(journey._id);
        out.push(`journey ${userId} ${journey.naturalKey}`);
      }
    }
    for (const journey of await ctx.db.query('journeys').withIndex('by_user', (q) => q.eq('userId', demoUserId)).collect()) {
      if (!journey.naturalKey.startsWith('demo-')) continue;
      await ctx.db.delete(journey._id);
      out.push(`viewer journey ${journey.naturalKey}`);
    }
    return out;
  },
});

/** Send ONE push to a live session's followers with copy written by hand —
 * `npx convex run devTools:pushToFollowers '{"sessionId":"…","body":"…"}'`.
 *
 * The poll chain's own stage pushes are deliberately narrow: each stage
 * fires at most once (notifiedStages) and a stamp older than
 * STAGE_PUSH_FRESH_MS is dropped, so a landing recorded hours after the fact
 * reaches nobody. That is right for the automatic path and leaves no way to
 * tell a circle about a landing the provider never reported (Kochi never
 * closed QR516 out on 2026-09-19). This is that way. It goes through
 * sendFollowerPush, so the same alias resolution, mute rules and deep link
 * apply as for a real stage push; it writes nothing and marks nothing as
 * notified. Internal, so no client can reach it. */
export const pushToFollowers = internalAction({
  args: {
    sessionId: v.id('liveSessions'),
    body: v.string(),
    /** Defaults to the chain's own "QR516 · DOH → COK". */
    heading: v.optional(v.string()),
  },
  // Explicit return type: this action reads the generated `internal` object,
  // which contains this action, and TypeScript will not infer through that
  // cycle (TS7022) — it degrades the whole api type when it tries.
  handler: async (
    ctx,
    { sessionId, body, heading },
  ): Promise<{ sent: number; reason?: string; heading?: string; body?: string }> => {
    const targets: {
      externalIds: string[];
      session: { number: string; carrier: string; fromCode: string; toCode: string };
      token: string | null;
    } | null = await ctx.runQuery(internal.liveInternal.getNotifyTargets, { sessionId });
    if (!targets) return { sent: 0, reason: 'no such session' };
    if (!targets.token) return { sent: 0, reason: 'trip is not shared — nothing to open' };
    if (!targets.externalIds.length) return { sent: 0, reason: 'no unmuted followers' };
    const s = targets.session;
    const title = heading ?? `${s.number || s.carrier} · ${s.fromCode} → ${s.toCode}`;
    await sendFollowerPush(
      targets.externalIds,
      title,
      body,
      `https://getflyright.com/t/${targets.token}`,
    );
    return { sent: targets.externalIds.length, heading: title, body };
  },
});

/** Give a profile row to anybody in somebody's circle who has none.
 *
 * A person who signed in with an email and never set a name used to get no
 * row at all (users.syncMyProfile bailed on an empty name), which left them
 * nameless, unsearchable and impossible to follow — requestFollow and
 * askToFollow both throw "No such person" without one. The client writes its
 * own row now; this catches the accounts that predate that.
 *
 * Reports what it found, so a run that changes nothing says so. */
export const backfillMissingProfiles = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ids = new Set<string>();
    for (const row of await ctx.db.query('circle').collect()) {
      ids.add(row.ownerId);
      ids.add(row.memberId);
    }
    for (const row of await ctx.db.query('follows').collect()) {
      ids.add(row.followerId);
      ids.add(row.ownerId);
    }
    for (const row of await ctx.db.query('circleRequests').collect()) {
      ids.add(row.fromUserId);
      ids.add(row.toUserId);
    }
    let written = 0;
    for (const userId of ids) {
      const existing = await ctx.db
        .query('profiles')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .unique();
      if (existing) continue;
      await ctx.db.insert('profiles', {
        userId,
        name: '',
        imageUrl: null,
        email: null,
        emailVerified: false,
        searchName: '',
        searchFirst: '',
        updatedAt: new Date().toISOString(),
      });
      written += 1;
    }
    return { seen: ids.size, written };
  },
});

/** Give a test account a real name and face.
 *
 * The simulators sign in with email-only Clerk users that carry no name, so
 * every one of them renders as "A traveler" with the same initials and the
 * same avatar hue — three identical faces in a row, impossible to tell
 * apart while checking a follower surface. Writes the profile directly;
 * the client will not overwrite it, because a signed-in account with no
 * Clerk name leaves an existing row alone (users.syncMyProfile). */
export const nameTestUser = internalMutation({
  args: { userId: v.string(), name: v.string(), imageUrl: v.union(v.string(), v.null()) },
  handler: async (ctx, { userId, name, imageUrl }) => {
    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    const fields = {
      name,
      imageUrl: safeAvatar(imageUrl),
      searchName: searchKey(name),
      searchFirst: firstNameKey(name),
      updatedAt: new Date().toISOString(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return { updated: existing.userId };
    }
    await ctx.db.insert('profiles', {
      userId,
      email: null,
      emailVerified: false,
      ...fields,
    });
    return { inserted: userId };
  },
});

/** Who is in the circles, for pointing nameTestUser at the right account. */
export const listCircleUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ids = new Set<string>();
    for (const row of await ctx.db.query('circle').collect()) {
      ids.add(row.ownerId);
      ids.add(row.memberId);
    }
    const out = [];
    for (const userId of ids) {
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .unique();
      out.push({ userId, name: profile?.name ?? null });
    }
    return out;
  },
});
