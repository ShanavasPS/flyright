import { and, eq, isNull } from 'drizzle-orm';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { db } from '@/db/client';
import { journeys } from '@/db/schema';
import { recordDelay } from '@/services/disruptions';
import { FlightLookupError, lookupFlight } from '@/services/flight-lookup';
import { inboundNewsworthy, inboundOutlook } from '@/services/inbound';
import { toDomainJourney } from '@/services/journeys';
import { maybeNotifyDelay, maybeNotifyInbound } from '@/services/notification-lifecycle';
import { proLocked } from '@/services/purchases';
import { noteFlightFacts, reconcileTravelDay } from '@/services/travel-day-lifecycle';

/**
 * Periodic background sweep over tracked flights near their departure: pull
 * live status, cache any delay for the journeys list, and let the lifecycle
 * escalate a notification when a delay becomes worth telling the user about.
 * The OS decides the actual cadence (BGTaskScheduler / WorkManager);
 * minimumInterval is only a floor.
 */
const TASK_NAME = 'flight-watch';

const HOUR_MS = 3_600_000;
/** Delays start publishing well before departure; the final arrival delay —
 * the one EU261 cares about — lands within hours after it. */
const WATCH_BEFORE_MS = 36 * HOUR_MS;
const WATCH_AFTER_MS = 12 * HOUR_MS;

// Global scope by contract: TaskManager must know the task when the app is
// launched headless for a background run, before any component mounts.
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    await checkTrackedFlights();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.warn('[flight-watch] sweep failed', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerFlightWatch(): Promise<void> {
  try {
    // Restricted on simulators and when the user disables Background App
    // Refresh — registering anyway just throws.
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
      console.log('[flight-watch] background tasks unavailable, skipping registration');
      return;
    }
    await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: 60 });
  } catch (error) {
    console.warn('[flight-watch] register failed', error);
  }
}

export async function checkTrackedFlights(now = new Date()): Promise<void> {
  const rows = await db
    .select()
    .from(journeys)
    .where(and(eq(journeys.source, 'lookup'), isNull(journeys.deletedAt)));

  // Departure-window filter in JS: stored timestamps mix offset formats, so
  // lexicographic SQL comparison against toISOString() would miss rows.
  const watched = rows.filter((row) => {
    const departure = Date.parse(row.scheduledDeparture);
    if (Number.isNaN(departure)) return false;
    return (
      departure >= now.getTime() - WATCH_AFTER_MS && departure <= now.getTime() + WATCH_BEFORE_MS
    );
  });

  // The inbound prediction and its early-warning push are Pro; skipping the
  // extra provider call for free users is what keeps the feature cheap.
  const inboundUnlocked = watched.length > 0 && !(await proLocked());

  for (const row of watched) {
    try {
      // Pre-departure, also resolve the inbound rotation — where the plane
      // is right now often predicts a delay before the airline announces it.
      const upcoming = Date.parse(row.scheduledDeparture) > now.getTime();
      const status = await lookupFlight(row.number, row.scheduledDeparture.slice(0, 10), {
        inbound: upcoming && inboundUnlocked,
      });
      await noteFlightFacts(row.id, status);
      const outlook = upcoming ? inboundOutlook(status) : null;
      if (outlook && inboundNewsworthy(outlook)) {
        await maybeNotifyInbound(toDomainJourney(row), outlook);
      }
      if (status.delayMinutes == null) continue;
      await recordDelay(row.id, status.delayMinutes);
      await maybeNotifyDelay(toDomainJourney(row), status.delayMinutes);
    } catch (error) {
      // Signed out (or over today's budget) the answer is the same for every
      // row, and neither costs a provider call — stop the sweep instead of
      // asking once per watched flight. Clerk's singleton may not exist in a
      // headless background launch, so this is checked by the answer rather
      // than by the session.
      if (error instanceof FlightLookupError && (error.signInRequired || error.quotaExceeded)) break;
      // One flight's lookup failing must not abort the rest of the sweep.
    }
  }
  // Fresh facts may change the live surface (gate posted, flight landed).
  await reconcileTravelDay();
}
