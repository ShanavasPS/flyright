import type { FlightStatus } from '@/services/flight-lookup';

/**
 * The delay the verdict card should judge, merging the live status lookup
 * with the locally recorded disruption (see services/disruptions.ts).
 *
 * The live API wins whenever it has an opinion: once a flight has landed its
 * delayMinutes is the final arrival delay EU261 cares about, and before that
 * it's the freshest prediction. The recorded value only steps in where live
 * data can't reach — the provider forgets flights after a while (404s), a
 * landed flight can come back without usable times, or the lookup simply
 * hasn't answered yet. That cache was written by the flight-watch sweep near
 * arrival, so for a concluded flight it holds the number that matters.
 *
 * A live "no delay" on a flight that hasn't landed beats any recorded value:
 * a prediction that recovered must not keep showing money. Recorded zeros
 * resolve to null so an on-time past trip reads as journal, not verdict.
 */
export function resolveDelayMinutes(
  live: FlightStatus | undefined,
  recordedDelayMinutes: number | null | undefined,
): number | null {
  if (live?.delayMinutes != null) return live.delayMinutes;
  if (live && !live.landed) return null;
  return recordedDelayMinutes ? recordedDelayMinutes : null;
}
