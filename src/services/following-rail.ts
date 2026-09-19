import type { PublicSession } from '../../convex/liveShared';

import { airportZone } from '@/services/airports';
import { compactLiveView } from '@/services/connections';
import { flightInstant } from '@/services/dates';
import { presumedStage, spanLabel } from '@/services/public-session';
import {
  AIRPORT_STAGES,
  hasLanded,
  type TravelStage,
} from '@/services/travel-day';
import { planFromSession } from '@/services/travel-day-plan';

/** How much of the ring the airport walk fills before take-off; the flight
 * itself fills the rest, so the ring moves the way the trip does — a few
 * ticks through the terminal, then a long sweep in the air. */
const WALK_SHARE = 0.3;

export interface RailStatus {
  /** 0–1: how much of the ring around the face is filled. */
  ring: number;
  /** The word or two under the name: "Boarded", "2h 15m", "Landed". */
  label: string;
  /** A span is a countdown; the glyph says to what. */
  icon: 'takeoff' | 'landing' | null;
  /** 'late' once the flight is half an hour behind (the app's one
   * threshold), 'done' once it is down. */
  tone: 'live' | 'late' | 'done';
  /** The corner badge on the face: the gate before boarding, a plane in the
   * air, a tick once down. */
  badge: { kind: 'gate'; gate: string } | { kind: 'plane' } | { kind: 'check' } | null;
}

/**
 * One followed trip as a face on the My travels rail: the ring, the short
 * status under the name and the badge. The same compactLiveView the pass
 * reads, so the rail and the People tab never disagree — only shorter,
 * because the rail has a face's width to say it in. The full words
 * ("Lands in 1h 45m", "Boarded · Gate 22") are the sheet a tap opens.
 */
export function railStatus(
  session: PublicSession,
  onward: Parameters<typeof compactLiveView>[1],
  now: Date,
): RailStatus {
  const view = compactLiveView(session, onward, now);
  const tone = view.delayed ? 'late' : 'live';
  const stage = (session.currentStage as TravelStage | null) ?? null;
  const presumed = presumedStage(session, now);

  // Landed with a connection still to leave: the pass has become the next
  // leg, and so does the face — a countdown to that departure.
  const connecting = view.leg.fromCode !== session.fromCode || view.leg.toCode !== session.toCode;
  if (connecting) {
    return {
      ring: 0,
      tone,
      badge: null,
      ...countdown(view.leg.departure, view.leg.fromCode, now, 'takeoff', 'Departing'),
    };
  }

  if (hasLanded(stage) || presumed === 'landed') {
    return {
      ring: 1,
      tone: 'done',
      badge: { kind: 'check' },
      icon: null,
      // Nobody said it landed, only the timetable: "Flown", as the pass says.
      label: hasLanded(stage) ? 'Landed' : 'Flown',
    };
  }

  if (stage === 'departed' || presumed === 'departed') {
    return {
      ring: WALK_SHARE + (1 - WALK_SHARE) * view.progress,
      tone,
      badge: { kind: 'plane' },
      ...countdown(view.leg.arrival, view.leg.toCode, now, 'landing', 'Landing'),
    };
  }

  // Still on the ground: the ring is the walk through the airport, the
  // stages this leg's plan has, as far as the traveller has tapped.
  const walk = planFromSession(session.plan).filter((s) =>
    (AIRPORT_STAGES as readonly string[]).includes(s),
  );
  const done = stage ? walk.indexOf(stage) + 1 : 0;
  return {
    ring: walk.length ? (WALK_SHARE * done) / walk.length : 0,
    tone,
    badge: session.gate ? { kind: 'gate', gate: session.gate } : null,
    ...(stage === 'boarded'
      ? { label: 'Boarded', icon: null }
      : countdown(view.leg.departure, view.leg.fromCode, now, 'takeoff', 'Departing')),
  };
}

function countdown(
  iso: string,
  code: string,
  now: Date,
  icon: 'takeoff' | 'landing',
  arriving: string,
): Pick<RailStatus, 'label' | 'icon'> {
  const left = flightInstant(iso, airportZone(code)) - now.getTime();
  if (Number.isNaN(left)) return { label: icon === 'takeoff' ? 'Today' : 'In the air', icon: null };
  if (left <= 60_000) return { label: arriving, icon: null };
  return { label: spanLabel(left), icon };
}
