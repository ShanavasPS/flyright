import type { Id } from '../../convex/_generated/dataModel';
/** The flight-path route's side of the Convex metering — cache, monthly cap
 * and per-caller meter in one round trip, then the provider call made from
 * Convex, then filing what was bought. Identity is lookup-gate's
 * `identifyCaller`; this module only spends.
 *
 * Server-only: never import from app code. */

import { api } from '../../convex/_generated/api';
import { flightAwareFetch, type PathProviderResponse } from '../../convex/flightPathFetch';
import type { PathBeginResult } from '../../convex/flightPaths';
import { lookupDay } from '../../convex/lookupShared';
import { convex, type GateSubject } from '@/server/lookup-gate';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** A provider call, made from Convex when metering is configured (the
 * hosting worker's own provider fetches are refused — see provider.fetchPath),
 * direct otherwise, which is what dev without a deployment does. */
export async function pathCall(path: string): Promise<PathProviderResponse> {
  const secret = process.env.LOOKUP_QUOTA_SECRET;
  const client = convex();
  if (!secret || !client) {
    if (isProduction()) throw new Error('Lookup metering unavailable');
    return flightAwareFetch(path);
  }
  return (await client.action(api.flightPaths.fetchPath, { secret, path })) as PathProviderResponse;
}

export async function beginPath(
  subject: GateSubject,
  request: { flight: string; date: string; sharedJourneyId?: Id<'journeys'> },
): Promise<PathBeginResult | { outcome: 'unavailable' }> {
  const secret = process.env.LOOKUP_QUOTA_SECRET;
  const client = convex();
  if (!secret || !client) {
    if (!isProduction()) return { outcome: 'permit' };
    return { outcome: 'unavailable' };
  }
  try {
    return await client.mutation(api.flightPaths.begin, {
      secret,
      day: lookupDay(new Date()),
      subject,
      ...request,
    });
  } catch (error) {
    console.warn('[path-gate] metering unavailable', error);
    return { outcome: 'unavailable' };
  }
}

/** Best-effort, like recordLookup: a failure here costs money on the next
 * identical request but never fails the response the caller is waiting for. */
export async function recordPath(args: {
  flight: string;
  date: string;
  payload: string | null;
  kind: string;
  expiresAt: number;
  cents: number;
  cacheable: boolean;
}): Promise<void> {
  const secret = process.env.LOOKUP_QUOTA_SECRET;
  const client = convex();
  if (!secret || !client) return;
  try {
    await client.mutation(api.flightPaths.record, { ...args, secret });
  } catch (error) {
    console.warn('[path-gate] could not cache the path', error);
  }
}
