import {
  type LegLike,
  chainLegs,
  instantWith,
  itineraryPending,
  layoverLabel,
  layoverMs,
} from '../../convex/itineraryShared';

import type { PublicSession } from '../../convex/liveShared';

import { airportZone } from '@/services/airports';
import { formatTime } from '@/services/dates';
import { followerStatus, liveTimes, sessionProgress, spanLabel, tripDone } from '@/services/public-session';
import { cityOf } from '@/services/timeline';
import { hasLanded, type TravelStage } from '@/services/travel-day';

/** The app's instants: stored strings pinned to the airport-zone table. */
export const legInstant = instantWith(airportZone);

/** What sits between two legs of one itinerary: where, and for how long. */
export interface Connection {
  /** The leg this one connects off — so a list can draw the joint only when
   * the two rows sit next to each other, whichever way the list is sorted. */
  prevId: string;
  viaCode: string;
  layover: string;
}

/** For every leg that continues an itinerary, the connection that leads into
 * it — keyed by the leg's id, so a list can draw the layover between two rows
 * without regrouping them. Legs are matched on the rule in itineraryShared:
 * same airport, after landing, within a day. */
export function connectionsInto<T extends LegLike & { id: string }>(legs: T[]): Map<string, Connection> {
  const out = new Map<string, Connection>();
  for (const chain of chainLegs(legs, legInstant)) {
    for (let i = 1; i < chain.length; i++) {
      const prev = chain[i - 1]!;
      const leg = chain[i]!;
      const ms = layoverMs(prev, leg, legInstant);
      if (ms !== null) out.set(leg.id, { prevId: prev.id, viaCode: prev.toCode, layover: layoverLabel(ms) });
    }
  }
  return out;
}

/** Where a leg is along its route on the timetable alone, 0–1: at the origin
 * until it departs, riding the line between departure and arrival, at the
 * destination after — for a connecting leg drawn before its own live
 * session exists. Held just inside both ends while airborne, like the live
 * progress, so the plane visibly leaves and visibly hasn't quite arrived. */
export function scheduledProgress(leg: LegLike, now: Date): number {
  const dep = legInstant(leg.scheduledDeparture, leg.fromCode);
  const arr = legInstant(leg.scheduledArrival, leg.toCode);
  const t = now.getTime();
  if (!Number.isFinite(dep) || t < dep) return 0;
  if (!Number.isFinite(arr) || arr <= dep) return 0.5;
  if (t >= arr) return 1;
  return Math.min(0.97, Math.max(0.03, (t - dep) / (arr - dep)));
}

/** A follower's trips filed by itinerary: a journey is ahead until its last
 * leg departs, then flown as a whole — legs in flying order either way,
 * trips soonest-first ahead and newest-first behind. */
export function splitByItinerary<T extends LegLike>(
  legs: T[],
  now: Date,
): { upcoming: T[]; past: T[] } {
  const chains = chainLegs(legs, legInstant);
  const start = (chain: T[]) => legInstant(chain[0]!.scheduledDeparture, chain[0]!.fromCode);
  const ahead = chains.filter((c) => itineraryPending(c, now.getTime(), legInstant));
  const behind = chains.filter((c) => !itineraryPending(c, now.getTime(), legInstant));
  ahead.sort((a, b) => start(a) - start(b));
  behind.sort((a, b) => start(b) - start(a));
  return { upcoming: ahead.flat(), past: behind.flat() };
}

/** "2h 55m in Doha" — the layover as the row between two legs says it. */
export function connectionLabel(c: Connection): string {
  return `${c.layover} in ${cityOf(c.viaCode)}`;
}

/** The connection to draw between two rows that sit next to each other in a
 * list, in either order — null when they are not legs of one itinerary. */
export function connectionBetween(
  connections: Map<string, Connection>,
  a: { id: string } | undefined,
  b: { id: string },
): Connection | null {
  if (!a) return null;
  const into = connections.get(b.id);
  if (into?.prevId === a.id) return into;
  const back = connections.get(a.id);
  if (back?.prevId === b.id) return back;
  return null;
}

/** The stops of an itinerary between its first origin and final destination,
 * for the compact multi-stop leg: each intermediate airport with the layover
 * spent there. */
export function viaStops(
  first: LegLike,
  onward: LegLike[],
): { stops: { code: string; layover: string | null }[]; toCode: string; arrival: string } {
  const legs = [first, ...onward];
  const stops = onward.map((leg, i) => {
    const ms = layoverMs(legs[i]!, leg, legInstant);
    return { code: leg.fromCode, layover: ms === null ? null : layoverLabel(ms) };
  });
  const last = legs[legs.length - 1]!;
  return { stops, toCode: last.toCode, arrival: last.scheduledArrival };
}

/** What a compact live surface (the People pass, the home Following row)
 * shows for a traveller mid-journey. While the live leg is flying, that leg.
 * Once it has landed and a connecting leg is still to leave, the pass becomes
 * the next leg: "Departs in 2h 26m", the landing and the layover as the
 * detail, the plane waiting at the connection airport — the follower's eye
 * moves on the way the traveller does. */
export interface CompactLiveView {
  headline: string;
  detail: string | null;
  delayed: boolean;
  leg: { fromCode: string; toCode: string; departure: string; arrival: string };
  progress: number;
  number: string;
  carrier: string;
  /** The onward line, only while the live leg itself is still the story. */
  connecting: string | null;
  /** "13h 52m in London" while the view is the connecting leg — the wait
   * between landing and leaving again, for surfaces with room for it. */
  layover: string | null;
  /** When the view IS the connecting leg, its journey id. */
  nextJourneyId: string | null;
}

export function compactLiveView(
  session: PublicSession,
  onward: (LegLike & { number: string; carrier: string; journeyId?: string })[],
  now: Date,
): CompactLiveView {
  const next = onward[0];
  const landed = tripDone(session, now);
  if (landed && next && legInstant(next.scheduledDeparture, next.fromCode) > now.getTime()) {
    const arrived = liveTimes(session).arrival;
    const gap = legInstant(next.scheduledDeparture, next.fromCode) - Date.parse(arrived);
    return {
      headline: `Departs in ${spanLabel(legInstant(next.scheduledDeparture, next.fromCode) - now.getTime())}`,
      detail: `${hasLanded(session.currentStage as TravelStage | null) ? 'Landed' : 'Due to land'} ${formatTime(arrived, airportZone(session.toCode))}`,
      layover: Number.isFinite(gap) && gap > 0 ? `${layoverLabel(gap)} in ${cityOf(session.toCode)}` : null,
      delayed: false,
      leg: {
        fromCode: next.fromCode,
        toCode: next.toCode,
        departure: next.scheduledDeparture,
        arrival: next.scheduledArrival,
      },
      progress: scheduledProgress(next, now),
      number: next.number,
      carrier: next.carrier,
      connecting: null,
      nextJourneyId: next.journeyId ?? null,
    };
  }
  const status = followerStatus(session, now);
  return {
    ...status,
    leg: { fromCode: session.fromCode, toCode: session.toCode, ...liveTimes(session) },
    progress: sessionProgress(session, now),
    number: session.number,
    carrier: session.carrier,
    connecting: onwardLine(session, onward, now),
    layover: null,
    nextJourneyId: null,
  };
}

/** The line under a live leg that continues: "2h 10m in Doha · then QR301 to
 * HEL 3:30 PM". The layover counts from the arrival the airline now says, so
 * a late landing shows the connection tightening. Null when the leg is the
 * last of its trip. */
export function onwardLine(
  session: Parameters<typeof liveTimes>[0] & { toCode: string },
  onward: (LegLike & { number: string; carrier: string })[],
  now: Date,
): string | null {
  const next = onward[0];
  if (!next) return null;
  // A connection that has already left is not "then": either its own live
  // session has taken over, or the trip is simply over.
  if (legInstant(next.scheduledDeparture, next.fromCode) <= now.getTime()) return null;
  const arrives = Date.parse(liveTimes(session).arrival);
  const departs = legInstant(next.scheduledDeparture, next.fromCode);
  const gap = departs - arrives;
  const wait = Number.isFinite(gap) && gap > 0 ? `${layoverLabel(gap)} in ${cityOf(session.toCode)}` : `Connecting in ${cityOf(session.toCode)}`;
  const flight = next.number || next.carrier;
  return `${wait} · then ${flight} to ${next.toCode} ${formatTime(next.scheduledDeparture, airportZone(next.fromCode))}`;
}
