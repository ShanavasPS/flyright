import { and, eq, isNull, or } from 'drizzle-orm';
import * as Notifications from 'expo-notifications';
import Storage from 'expo-sqlite/kv-store';

import { db } from '@/db/client';
import { claims, journeys } from '@/db/schema';
import type { Journey } from '@/rules/types';
import { getPushEnabled, setUserTag } from '@/services/notifications';
import {
  delayNotification,
  delayTier,
  outranks,
  OWNED_ID,
  planReminders,
  type DelayTier,
  type ReminderClaim,
} from '@/services/notification-plan';

/**
 * Keeps the locally scheduled notifications in lockstep with the journal:
 * a pre-trip reminder per upcoming journey and the six-week countdown pair
 * per sent claim. Reconcile is idempotent — it reads the DB, plans the
 * desired schedule, cancels owned requests that fell out of it, and
 * (re)schedules the rest, so callers just fire it after any mutation.
 *
 * Everything is gated on getPushEnabled(): the Settings toggle is the single
 * switch for remote push AND local reminders — flipping it off empties the
 * schedule, flipping it back on rebuilds it from the DB.
 */

/** Mirrors the Clerk session for scheduling scope — reconcile runs outside
 * React (background task, service mutations) where useAuth isn't available. */
const VIEWER_KEY = 'notification-viewer';

export function setNotificationViewer(userId: string | null) {
  if (userId) Storage.setItemSync(VIEWER_KEY, userId);
  else Storage.removeItemSync(VIEWER_KEY);
  void reconcileNotifications();
}

/** Same visibility rule as services/journeys.ts: the viewer's own rows plus
 * unclaimed anonymous ones. A signed-out account's trips must not keep
 * reminding the device. */
function visibleJourneys(viewerId: string | null) {
  return and(
    isNull(journeys.deletedAt),
    viewerId
      ? or(isNull(journeys.userId), eq(journeys.userId, viewerId))
      : isNull(journeys.userId),
  );
}

/** iOS shows nothing for foreground notifications unless a handler opts in.
 * Banners without sound keep an in-app delay alert glanceable, not jarring. */
export function initNotificationLifecycle() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

let reconciling: Promise<void> | null = null;

/** Serialized so a burst of mutations (sync pulling several rows) can't
 * interleave cancel/schedule calls from two overlapping runs. */
export function reconcileNotifications(): Promise<void> {
  // Deliberately NOT the LogBox-ignored '[notifications]' prefix: a failed
  // reconcile is a real bug, and dev builds should toast it.
  const run = (reconciling ?? Promise.resolve()).then(doReconcile).catch((error) => {
    console.warn('[notification-lifecycle] reconcile failed', error);
  });
  reconciling = run;
  return run;
}

async function doReconcile(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const owned = scheduled.filter((request) => OWNED_ID.test(request.identifier));

  if (!(await getPushEnabled())) {
    await Promise.all(
      owned.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
    );
    return;
  }

  const viewerId = Storage.getItemSync(VIEWER_KEY);
  const journeyRows = await db.select().from(journeys).where(visibleJourneys(viewerId));
  const claimRows = await db
    .select()
    .from(claims)
    .innerJoin(journeys, eq(claims.journeyId, journeys.id))
    .where(
      viewerId
        ? or(isNull(claims.userId), eq(claims.userId, viewerId))
        : isNull(claims.userId),
    );

  const reminderClaims: ReminderClaim[] = claimRows.map((row) => ({
    id: row.claims.id,
    status: row.claims.status,
    responseDeadline: row.claims.responseDeadline,
    amount: row.claims.amount,
    currency: row.claims.currency,
    journey: row.journeys,
  }));

  const plan = planReminders(journeyRows, reminderClaims, new Date());
  const wanted = new Set(plan.map((reminder) => reminder.id));

  await Promise.all(
    owned
      .filter((request) => !wanted.has(request.identifier))
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
  // Same-identifier scheduling replaces the pending request, so a journey
  // whose departure was edited gets its reminder moved, not duplicated.
  await Promise.all(
    plan.map((reminder) =>
      Notifications.scheduleNotificationAsync({
        identifier: reminder.id,
        content: { title: reminder.title, body: reminder.body, data: { url: reminder.url } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminder.fireDate,
        },
      }),
    ),
  );

  updateSegmentTags(journeyRows, reminderClaims, new Date());
}

/** OneSignal segment tags, recomputed from the same snapshot the schedule
 * uses. These power dashboard Journeys (win-back when no upcoming trip,
 * nudges while a claim is open) without any server of our own. */
function updateSegmentTags(
  journeyRows: { scheduledDeparture: string }[],
  reminderClaims: ReminderClaim[],
  now: Date,
) {
  const upcoming = journeyRows
    .map((row) => Date.parse(row.scheduledDeparture))
    .filter((t) => !Number.isNaN(t) && t > now.getTime());
  const nextTripDays = upcoming.length
    ? Math.ceil((Math.min(...upcoming) - now.getTime()) / 86_400_000)
    : null;

  setUserTag('trips', String(journeyRows.length));
  setUserTag('next_trip_days', nextTripDays == null ? 'none' : String(nextTripDays));
  setUserTag(
    'open_claims',
    String(reminderClaims.filter((claim) => claim.status === 'sent').length),
  );
}

const tierKey = (journeyId: string) => `delay-tier-${journeyId}`;

/**
 * Fire an immediate delay alert if this observation escalates the journey to
 * a new tier (quiet → "running late" → "you're owed money"). The recorded
 * tier only ratchets upward, so a delay estimate that oscillates around a
 * boundary can't spam.
 */
export async function maybeNotifyDelay(journey: Journey, delayMinutes: number): Promise<void> {
  const tier = delayTier(journey, delayMinutes);
  const previous = (Storage.getItemSync(tierKey(journey.id)) ?? 'none') as DelayTier;
  if (!outranks(tier, previous)) return;
  Storage.setItemSync(tierKey(journey.id), tier);

  if (!(await getPushEnabled())) return;
  const content = delayNotification(journey, delayMinutes, tier as Exclude<DelayTier, 'none'>);
  await Notifications.scheduleNotificationAsync({
    identifier: content.id,
    content: { title: content.title, body: content.body, data: { url: content.url } },
    trigger: null,
  });
}
