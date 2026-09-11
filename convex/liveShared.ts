/** Pure helpers for the travel-day live sessions — no ctx, no I/O.
 * Stage keys mirror src/services/travel-day.ts exactly; rename together. */

import { airportZone, flightInstant } from './airportZones';
import type { Doc } from './_generated/dataModel';

export const STAGE_ORDER = [
  'at_airport',
  'checked_in',
  'bag_dropped',
  'security',
  'immigration',
  'boarded',
  'departed',
  'landed',
] as const;

export const stageIndex = (stage: string | null): number =>
  stage === null ? -1 : STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]);

/** Every stage pushes to followers — the whole point of a circle is that
 * nobody has to text "boarded yet?". Each stage pushes at most once per
 * session (notifiedStages), and quick successive taps debounce into one. */
export const NOTIFY_STAGES = new Set<string>(STAGE_ORDER);

export const STAGE_PUSH_COPY: Record<string, (name: string, to: string) => string> = {
  at_airport: (n) => `${n} is at the airport`,
  checked_in: (n) => `${n} has checked in`,
  bag_dropped: (n) => `${n} has dropped the bags`,
  security: (n) => `${n} is through security`,
  immigration: (n) => `${n} is through immigration`,
  boarded: (n) => `${n} is on board`,
  departed: (n, to) => `${n} is in the air to ${to}`,
  landed: (n, to) => `${n} landed in ${to}`,
};

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** Where the flight is by the clocks alone, for a session with no stage
 * past the airport recorded — a manual trip nobody polls and the traveller
 * never tapped through, or a tracked flight the airline hasn't confirmed
 * yet: 'departed' once the (estimated) departure is a minute gone, 'landed'
 * once the (estimated) arrival is, null while it is still to leave. A
 * recorded departed/landed stage wins over any guess. A minute past
 * departure is "departing now", not yet a presumption. One rule for the
 * traveller's card, the Live Activity and every follower surface, so no
 * screen holds "Departing now" for the two days a session stays open. */
export function presumedFlightStage(
  stage: string | null,
  departureMs: number,
  arrivalMs: number,
  now: number,
): 'departed' | 'landed' | null {
  if (stage === 'landed' || stage === 'departed') return stage;
  if (!Number.isNaN(arrivalMs) && arrivalMs <= now - MINUTE_MS) return 'landed';
  if (!Number.isNaN(departureMs) && departureMs <= now - MINUTE_MS) return 'departed';
  return null;
}

/** Of a traveller's active sessions, the one a follower should be shown:
 * a leg still in the air or still to leave beats one that has landed (the
 * landed leg of a connection stays active for two days while the next leg
 * becomes the story), soonest departure first among equals. */
export function preferredSession<
  T extends { currentStage: string | null; scheduledDeparture: string; fromCode: string },
>(
  sessions: T[],
): T | null {
  const score = (s: T) => (s.currentStage === 'landed' ? 1 : 0);
  return (
    [...sessions].sort(
      (a, b) =>
        score(a) - score(b) ||
        flightInstant(a.scheduledDeparture, a.fromCode) - flightInstant(b.scheduledDeparture, b.fromCode),
    )[0] ?? null
  );
}

/** A session lives until 48 h past scheduled arrival; after that the trip is
 * history rather than a travel day. Both the expiry stamp and the "is this
 * still worth a session" check read this, so they can't drift apart. */
export const SESSION_TTL_MS = 48 * HOUR_MS;

export function sessionExpiryFor(scheduledArrival: string, now: number, toCode?: string | null): number {
  const arrival = flightInstant(scheduledArrival, toCode);
  return (Number.isNaN(arrival) ? now : arrival) + SESSION_TTL_MS;
}

/** True once a trip is far enough past to be history — nothing left to open a
 * live session for, and nothing a circle wants pushed about it. */
export const tripIsOver = (scheduledArrival: string, now: number, toCode?: string | null): boolean =>
  sessionExpiryFor(scheduledArrival, now, toCode) <= now;

/** iOS ends a Live Activity eight hours after it starts, whatever the app
 * does (Apple's documented cap). */
export const ACTIVITY_LIFETIME_MS = 8 * HOUR_MS;
const LIVE_LEAD_MS = 4 * HOUR_MS;

/** Whether the poll chain should push-to-start a fresh Live Activity on the
 * traveler's phone: inside the live window (T−4h until an hour past the
 * expected landing), not landed, and either no activity is known or the
 * known one has outlived the eight-hour cap. `activityStartedAt` doubles as
 * the last-attempt stamp when the id is null (an Android traveler has no
 * push-to-start token — retry at most once per lifetime, not every poll).
 * A row with an id but no start stamp predates the field: the device owns
 * that activity and its own liveness sweep restarts it. */
export function shouldStartActivity(s: Doc<'liveSessions'>, now: number): boolean {
  if (s.status !== 'active') return false;
  if (s.currentStage === 'landed' || s.actualArrival) return false;
  const dep = flightInstant(s.estimatedDeparture ?? s.scheduledDeparture, s.fromCode);
  const arr = flightInstant(s.estimatedArrival ?? s.scheduledArrival, s.toCode);
  if (Number.isNaN(dep) || now < dep - LIVE_LEAD_MS) return false;
  if (!Number.isNaN(arr) && now > arr + HOUR_MS) return false;
  const stamp = s.activityStartedAt ? Date.parse(s.activityStartedAt) : NaN;
  if (!s.activityId) return Number.isNaN(stamp) || now - stamp >= ACTIVITY_LIFETIME_MS;
  if (Number.isNaN(stamp)) return false;
  return now - stamp >= ACTIVITY_LIFETIME_MS;
}

/** Attributes for a server-started activity — the immutable half the widget
 * reads (mirrors startTravelActivity in src/services/live-activity.ts). */
export function activityAttributes(s: Doc<'liveSessions'>): Record<string, unknown> {
  const flight = s.number || s.carrier;
  return {
    journeyId: s.naturalKey,
    title: `${flight} · ${s.fromCode} → ${s.toCode}`,
    fromCode: s.fromCode,
    toCode: s.toCode,
    flightLabel: flight,
  };
}

/** How long after a stage was stamped a push about it is still news. */
export const STAGE_PUSH_FRESH_MS = 60 * MINUTE_MS;

/** Last gate before a follower push goes out. Two things get stopped here:
 *
 *  - an expired session — a trip that flew days ago can still reach the
 *    server (a device uploads its stage state after a reinstall, or a status
 *    refresh folds actual departure/arrival into an old trip's timeline);
 *  - a stage stamped long ago, which is timeline backfill, not an event.
 *
 * A removed trip is exempt: followers should always learn the trip is gone. */
export function shouldNotifyFollowers(
  args: {
    kind: string;
    currentStage: string | null;
    stageTimes: Record<string, string>;
    expiresAt: string;
  },
  now: number,
): boolean {
  if (args.kind === 'removed') return true;

  const expires = Date.parse(args.expiresAt);
  if (!Number.isNaN(expires) && expires <= now) return false;

  if (args.kind === 'stage') {
    const stamp = args.currentStage ? args.stageTimes[args.currentStage] : null;
    const at = stamp ? Date.parse(stamp) : NaN;
    // No usable stamp: the stage was reached now by definition — let it through.
    if (!Number.isNaN(at) && now - at > STAGE_PUSH_FRESH_MS) return false;
  }
  return true;
}

/** 22-char base62 token — the only public handle for a session. */
export function makeToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(22);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % 62];
  return out;
}

/** Poll cadence by phase of the travel day — sessions only poll while they
 * have an audience, so this is the whole AeroDataBox budget (~20-30 calls
 * per shared trip). Returns null when polling should stop. */
export function nextPollDelayMs(session: Doc<'liveSessions'>, now: number): number | null {
  if (session.status !== 'active') return null;
  if (session.actualArrival || session.currentStage === 'landed') return null;

  const dep = flightInstant(session.scheduledDeparture, session.fromCode);
  const arr = flightInstant(session.scheduledArrival, session.toCode);
  if (Number.isNaN(dep)) return null;
  // Hard stop: nothing after scheduled arrival + 6h.
  if (!Number.isNaN(arr) && now > arr + 6 * HOUR_MS) return null;

  const untilDep = dep - now;
  if (untilDep > 6 * HOUR_MS) return untilDep - 6 * HOUR_MS; // sleep to T−6h
  if (untilDep > 90 * MINUTE_MS) return 2 * HOUR_MS;
  if (untilDep > -30 * MINUTE_MS) return 10 * MINUTE_MS; // gate/boarding window
  const untilArr = Number.isNaN(arr) ? 0 : arr - now;
  if (untilArr > 40 * MINUTE_MS) return 45 * MINUTE_MS; // in flight
  return 10 * MINUTE_MS; // approach + landing confirm
}

export const STAGE_LABELS: Record<string, string> = {
  at_airport: 'At the airport',
  checked_in: 'Checked in',
  bag_dropped: 'Bags dropped',
  security: 'Through security',
  immigration: 'Through immigration',
  boarded: 'On board',
  departed: 'Departed',
  landed: 'Landed',
};

/** A flight time as its own airport reads it — the clock the traveler is
 * living by, and the one their followers want to see, whatever zone either
 * of them is in. Falls back to a labelled UTC reading for the rare code the
 * airport table doesn't carry, since an unlabelled wrong clock is worse. */
const fmtTime = (iso: string | null, iata: string | null): string => {
  if (!iso) return '';
  const zone = airportZone(iata);
  // Pinned first: a bare wall clock must print as written, not shifted by
  // the UTC reading Date would give it.
  const at = flightInstant(iso, iata);
  if (Number.isNaN(at)) return '';
  const clock = new Date(at).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zone ?? 'UTC',
  });
  return zone ? clock : `${clock} UTC`;
};

/** "Departs in 2h" / "in 75 min" / "now" — mirrors countdownLabel in
 * src/services/travel-day.ts, and is timezone-free (unlike clock times). */
function countdownBit(departureMs: number, now: number): string {
  const mins = Math.max(0, Math.round((departureMs - now) / 60_000));
  if (mins >= 90) return `in ${Math.round(mins / 60)}h`;
  return mins > 0 ? `in ${mins} min` : 'now';
}

/** Mirrors NEXT_STEP_LABELS / NEXT_STEP_COMPACT in src/services/travel-day.ts:
 * the traveler's own lock screen speaks in next steps, followers get the
 * done-stage copy above. Sessions are tracked flights, so the walk ends at
 * 'boarded' — flight data takes over from there. */
const NEXT_STEP_LABELS: Record<string, string> = {
  checked_in: 'Check in',
  bag_dropped: 'Drop your bags',
  security: 'Head to security',
  immigration: 'Passport control',
  boarded: 'Go to your gate',
};
const NEXT_STEP_COMPACT: Record<string, string> = {
  checked_in: 'Check in',
  bag_dropped: 'Bag drop',
  security: 'Security',
  immigration: 'Passport',
  boarded: 'Gate',
};
const STAGE_COMPACT: Record<string, string> = {
  boarded: 'Boarded',
  departed: 'In air',
  landed: 'Landed',
};
const BOARDED_INDEX = stageIndex('boarded');

/** The traveler's next tappable stage: the one after the current stage, up
 * to 'boarded'. Null before the first tap (the countdown speaks then) and
 * once boarding is done. */
function nextStep(currentStage: string | null): string | null {
  const index = stageIndex(currentStage);
  if (index < 0 || index >= BOARDED_INDEX) return null;
  return STAGE_ORDER[index + 1];
}

/** Mirrors flightProgress in src/services/travel-day.ts: zero until the
 * flight has departed, time-based between departure and estimated arrival
 * (held just inside both ends), 1 once landed. */
export function flightProgress(s: Doc<'liveSessions'>, now: number): number {
  const departed = flightInstant(
    s.actualDeparture ?? s.stageTimes.departed ?? s.estimatedDeparture ?? s.scheduledDeparture,
    s.fromCode,
  );
  const arrives = flightInstant(s.estimatedArrival ?? s.scheduledArrival, s.toCode);
  const stage = presumedFlightStage(s.currentStage, departed, arrives, now);
  if (stageIndex(stage) < stageIndex('departed')) return 0;
  if (stage === 'landed') return 1;
  if (Number.isNaN(departed) || Number.isNaN(arrives) || arrives <= departed) return 0.5;
  return Math.min(0.97, Math.max(0.03, (now - departed) / (arrives - departed)));
}

/** Which instant the widget's self-ticking countdown runs to — mirrors
 * liveCountdown in src/services/travel-day.ts. The (estimated) departure
 * until the wheels leave, the (estimated) arrival in the air, nothing once
 * landed. The widget re-anchors whenever a push moves the estimate, and
 * ticks on its own in between — so a delay the airline posts an hour out
 * reaches the Dynamic Island as a longer countdown, not a frozen number. */
export function liveCountdown(
  currentStage: string | null,
  departureMs: number,
  arrivalMs: number,
): { end: number; kind: 'departure' | 'arrival' } | null {
  if (currentStage === 'landed') return null;
  if (currentStage === 'departed') {
    return Number.isNaN(arrivalMs) ? null : { end: arrivalMs, kind: 'arrival' };
  }
  return Number.isNaN(departureMs) ? null : { end: departureMs, kind: 'departure' };
}

/** Server-side mirror of liveContent() for the Live Activity content state —
 * same dict keys the Swift widget reads. Clock times render as UTC (the
 * server doesn't know the traveler's timezone); the in-app timeline stays
 * local. The headline carries the countdown ("Flight in 3h", "Lands in 40
 * min"); the subtitle is the next step and never repeats it. */
export function buildContentState(s: Doc<'liveSessions'>, now: number): Record<string, unknown> {
  const delayed = s.delayMinutes != null && s.delayMinutes >= 30;
  const delayLabel = delayed
    ? `${Math.floor(s.delayMinutes! / 60) ? `${Math.floor(s.delayMinutes! / 60)}h ` : ''}${s.delayMinutes! % 60} min late`.replace('h 0 min', 'h')
    : '';
  const next = nextStep(s.currentStage);
  const index = stageIndex(s.currentStage);
  const gateWord = s.gate ? `gate ${s.gate}` : 'your gate';

  const effectiveDeparture = s.estimatedDeparture ?? s.scheduledDeparture;
  const departureMs = flightInstant(effectiveDeparture, s.fromCode);
  const arrivalMs = flightInstant(s.estimatedArrival ?? s.scheduledArrival, s.toCode);
  const presumed = presumedFlightStage(s.currentStage, departureMs, arrivalMs, now);
  const countdown = liveCountdown(presumed, departureMs, arrivalMs);
  let headline: string;
  if (s.currentStage === 'landed') {
    headline = 'Landed';
  } else if (s.currentStage === 'departed') {
    const toLanding = Number.isNaN(arrivalMs) ? null : countdownBit(arrivalMs, now);
    headline = toLanding === null ? 'In the air' : toLanding === 'now' ? 'Landing now' : `Lands ${toLanding}`;
  } else if (presumed === 'landed') {
    headline = 'Flown';
  } else if (presumed === 'departed') {
    const toLanding = countdownBit(arrivalMs, now);
    headline = toLanding === 'now' ? 'Due to land about now' : `Due to land ${toLanding}`;
  } else if (Number.isNaN(departureMs)) {
    headline = `Departs ${fmtTime(effectiveDeparture, s.fromCode)}`;
  } else {
    const toDeparture = countdownBit(departureMs, now);
    headline = toDeparture === 'now' ? 'Departing now' : `Flight ${toDeparture}`;
  }

  let subtitle: string;
  if (s.currentStage === 'landed') {
    subtitle = s.baggageBelt ? `Bags at belt ${s.baggageBelt}` : `Welcome to ${s.toCode}`;
  } else if (s.currentStage === 'departed') {
    subtitle = s.baggageBelt ? `In the air · Bags at belt ${s.baggageBelt}` : 'In the air';
  } else if (presumed === 'landed') {
    subtitle = `Due to land ${fmtTime(s.estimatedArrival ?? s.scheduledArrival, s.toCode)} · going by the timetable`;
  } else if (presumed === 'departed') {
    subtitle = 'Going by the timetable';
  } else if (s.currentStage === 'boarded') {
    subtitle = 'On board · ready for pushback';
  } else if (next === null) {
    // Before the first tap: the airport once the live window opens (T−4h).
    subtitle =
      !Number.isNaN(departureMs) && now >= departureMs - 4 * HOUR_MS
        ? 'Head to the airport'
        : 'Nothing to do yet';
  } else if (next === 'boarded') {
    // The session has no boarding time or check-in desk, so those
    // refinements stay client-side.
    subtitle = `Go to ${gateWord}`;
  } else {
    subtitle = NEXT_STEP_LABELS[next];
  }
  if (delayLabel) subtitle = `${delayLabel} · ${subtitle}`;

  let compactLabel: string;
  if (presumed && s.currentStage !== presumed) compactLabel = presumed === 'landed' ? 'Flown' : 'Timetable';
  else if (s.currentStage === null) compactLabel = fmtTime(effectiveDeparture, s.fromCode);
  else if (s.currentStage === 'landed' && s.baggageBelt) compactLabel = `Belt ${s.baggageBelt}`;
  else if (index >= BOARDED_INDEX || next === null) compactLabel = STAGE_COMPACT[s.currentStage] ?? '';
  else if (next === 'boarded') compactLabel = s.gate ? `G${s.gate}` : NEXT_STEP_COMPACT.boarded;
  else compactLabel = NEXT_STEP_COMPACT[next];

  return {
    headline,
    subtitle,
    compactLabel,
    departsAt: Number.isNaN(departureMs) ? 0 : departureMs,
    arrivesAt: Number.isNaN(arrivalMs) ? 0 : arrivalMs,
    countdownEnd: countdown?.end ?? 0,
    countdownKind: countdown?.kind ?? '',
    progress: flightProgress(s, now),
    stageLabel: s.currentStage ? (STAGE_LABELS[s.currentStage] ?? '') : '',
    gate: s.gate ?? '',
    terminal: s.terminal ?? '',
    delayLabel,
    emphasis: delayed ? 'delay' : s.gate ? 'gate' : 'none',
    depTime: fmtTime(effectiveDeparture, s.fromCode),
    arrTime: fmtTime(s.estimatedArrival ?? s.scheduledArrival, s.toCode),
  };
}

export interface PublicSession {
  status: 'active' | 'closed' | 'canceled';
  travelerName: string | null;
  followerCount: number;
  carrier: string;
  number: string;
  fromCode: string;
  toCode: string;
  scheduledDeparture: string;
  scheduledArrival: string;
  currentStage: string | null;
  stageTimes: Record<string, string>;
  flightStatus: string | null;
  delayMinutes: number | null;
  gate: string | null;
  terminal: string | null;
  baggageBelt: string | null;
  estimatedDeparture: string | null;
  actualDeparture: string | null;
  estimatedArrival: string | null;
  actualArrival: string | null;
}

/** The ONLY way session data leaves the server for non-owners: a whitelist.
 * Never userId, naturalKey, shareToken, activityId, or push bookkeeping. */
export function toPublicSession(
  s: Doc<'liveSessions'>,
  travelerName: string | null,
  followerCount: number,
): PublicSession {
  return {
    status: s.status,
    travelerName,
    followerCount,
    carrier: s.carrier,
    number: s.number,
    fromCode: s.fromCode,
    toCode: s.toCode,
    scheduledDeparture: s.scheduledDeparture,
    scheduledArrival: s.scheduledArrival,
    currentStage: s.currentStage,
    stageTimes: s.stageTimes,
    flightStatus: s.flightStatus,
    delayMinutes: s.delayMinutes,
    gate: s.gate,
    terminal: s.terminal,
    baggageBelt: s.baggageBelt,
    estimatedDeparture: s.estimatedDeparture,
    actualDeparture: s.actualDeparture,
    estimatedArrival: s.estimatedArrival,
    actualArrival: s.actualArrival,
  };
}
