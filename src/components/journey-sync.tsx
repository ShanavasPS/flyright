import { useAuth } from '@clerk/expo';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useRef } from 'react';

import { api } from '../../convex/_generated/api';

import { db } from '@/db/client';
import { journeys } from '@/db/schema';
import { planSync, toRemoteJourney } from '@/services/sync-merge';
import {
  applyRemoteJourney,
  claimAnonymousJourneys,
  markJourneysSynced,
} from '@/services/sync';

const PUSH_CHUNK = 200;

/** Keeps local SQLite and Convex converged for the signed-in user. Renders
 * nothing. Mounted inside ConvexProviderWithClerk, which mounts only after
 * drizzle migrations succeed — DB access is safe here unconditionally.
 *
 * Signed out: does nothing; anonymous journeys stay local-only. Remote
 * absence never deletes anything — only tombstones do, softly.
 */
export function JourneySync() {
  const { isLoaded, userId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const remote = useQuery(api.journeys.list, isAuthenticated ? {} : 'skip');
  const push = useMutation(api.journeys.push);
  // All rows, tombstones included — deletes must sync too.
  const { data: local } = useLiveQuery(db.select().from(journeys));
  const busy = useRef(false);

  // Sign-in claims the device's anonymous rows for this account.
  useEffect(() => {
    if (!isLoaded || !userId) return;
    void claimAnonymousJourneys(userId);
  }, [isLoaded, userId]);

  // Merge loop. Terminates structurally: after a push/apply both sides carry
  // the same updatedAt, which planSync treats as "no work" — so the re-renders
  // triggered by our own writes produce an empty plan and stop here.
  useEffect(() => {
    if (!userId || !isAuthenticated || remote === undefined || !local) return;
    if (busy.current) return; // live query re-fires after our writes; next pass picks up

    // Unclaimed rows enter sync only after the claim effect stamps them.
    const mine = local.filter((row) => row.userId === userId);
    const plan = planSync(mine, remote);
    if (!plan.pushRows.length && !plan.applyLocally.length) return;

    busy.current = true;
    void (async () => {
      try {
        for (let i = 0; i < plan.pushRows.length; i += PUSH_CHUNK) {
          const chunk = plan.pushRows.slice(i, i + PUSH_CHUNK);
          await push({ rows: chunk.map(toRemoteJourney) });
          await markJourneysSynced(chunk);
        }
        for (const row of plan.applyLocally) {
          await applyRemoteJourney(row, userId);
        }
      } catch {
        // Rows stay dirty; the next remote/local change retries the plan.
      } finally {
        busy.current = false;
      }
    })();
  }, [userId, isAuthenticated, remote, local, push]);

  return null;
}
