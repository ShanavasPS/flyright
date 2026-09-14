import type { Doc } from './_generated/dataModel';
import { flightInstant } from './airportZones';
import { buildContentState, landedOrLater, presumedFlightStage, STAGE_LABELS } from './liveShared';

const HOUR = 3_600_000;
export const FOLLOWER_ACTIVITY_PREFIX = 'following~';

/** Keep arrivals useful for pickup, then dismiss. Timetable-only flights
 * get a bounded window too; a missing landing event cannot pin them forever. */
export function followerActivityWindow(s: Doc<'liveSessions'>, now: number) {
  const scheduledDeparture = flightInstant(s.scheduledDeparture, s.fromCode);
  const estimatedDeparture = flightInstant(s.estimatedDeparture ?? s.scheduledDeparture, s.fromCode);
  // A delay must not move an already-open travel day back into "waiting".
  const departure = Math.min(scheduledDeparture, estimatedDeparture);
  const arrival = flightInstant(
    s.actualArrival ?? s.stageTimes.landed ?? s.estimatedArrival ?? s.scheduledArrival,
    s.toCode,
  );
  const startsAt = departure - 4 * HOUR;
  const endsAt = Math.min(arrival + HOUR, Date.parse(s.expiresAt));
  const ended = s.status !== 'active' || /cancel/i.test(s.flightStatus ?? '') ||
    !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || now >= endsAt;
  return { phase: ended ? 'ended' as const : now < startsAt ? 'waiting' as const : 'live' as const, startsAt, endsAt };
}

/** Follower copy describes the traveller, never tells the reader to board
 * or collect bags. Flight estimates and timetable uncertainty stay intact. */
export function followerContentState(s: Doc<'liveSessions'>, name: string, now: number): Record<string, unknown> {
  const content = buildContentState(s, now);
  const stage = s.currentStage ? STAGE_LABELS[s.currentStage] : null;
  const landed = landedOrLater(s.currentStage);
  const presumed = presumedFlightStage(s.currentStage,
    flightInstant(s.estimatedDeparture ?? s.scheduledDeparture, s.fromCode),
    flightInstant(s.estimatedArrival ?? s.scheduledArrival, s.toCode), now);
  const assumed = !!presumed && !landed && s.currentStage !== 'departed';
  const detail = assumed ? 'Going by the timetable' : stage ?? 'Waiting for departure';
  return {
    ...content,
    subtitle: `${name} · ${detail}${landed && s.baggageBelt ? ` · Bags at belt ${s.baggageBelt}` : ''}`,
    compactLabel: assumed ? 'Timetable' : landed ? 'Landed' : s.currentStage === 'departed' ? 'In air' : s.currentStage === 'boarded' ? 'Boarded' : s.gate ? `G${s.gate}` : 'Following',
    ...(landed ? { countdownEnd: 0, countdownKind: '' } : {}),
  };
}

/** Redacted final state for revoked access. Route attributes are immutable,
 * so the end push also requests immediate dismissal. */
export const FOLLOWER_ACTIVITY_ENDED = {
  headline: 'Updates ended', subtitle: 'This trip is no longer on your Lock Screen',
  progress: 0, compactLabel: '', stageLabel: '', countdownEnd: 0, countdownKind: '',
  gate: '', terminal: '', delayLabel: '', emphasis: 'none', depTime: '', arrTime: '',
};
