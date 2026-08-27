/** Pure helpers for the travel-day live sessions — no ctx, no I/O.
 * Stage keys mirror src/services/travel-day.ts exactly; rename together. */

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

/** Stages worth a follower push. Everything else only updates the widget
 * and the reactive timeline. */
export const NOTIFY_STAGES = new Set(['at_airport', 'security', 'boarded', 'departed', 'landed']);

export const STAGE_PUSH_COPY: Record<string, (name: string, to: string) => string> = {
  at_airport: (n) => `${n} is at the airport`,
  security: (n) => `${n} is through security`,
  boarded: (n) => `${n} is on board`,
  departed: (n, to) => `${n} is in the air to ${to}`,
  landed: (n, to) => `${n} landed in ${to}`,
};

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

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

  const dep = Date.parse(session.scheduledDeparture);
  const arr = Date.parse(session.scheduledArrival);
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

const fmtTime = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
    : '';

/** "Departs in 2h" / "in 75 min" / "now" — mirrors countdownLabel in
 * src/services/travel-day.ts, and is timezone-free (unlike clock times). */
function countdownBit(departureMs: number, now: number): string {
  const mins = Math.max(0, Math.round((departureMs - now) / 60_000));
  if (mins >= 90) return `in ${Math.round(mins / 60)}h`;
  return mins > 0 ? `in ${mins} min` : 'now';
}

/** Server-side mirror of liveContent() for the Live Activity content state —
 * same dict keys the Swift widget reads. Clock times render as UTC (the
 * server doesn't know the traveler's timezone); the in-app timeline stays
 * local. The pre-departure subtitle counts down instead — the clock time
 * already sits under the route code. */
export function buildContentState(s: Doc<'liveSessions'>, now: number): Record<string, unknown> {
  const delayed = s.delayMinutes != null && s.delayMinutes >= 30;
  const delayLabel = delayed
    ? `${Math.floor(s.delayMinutes! / 60) ? `${Math.floor(s.delayMinutes! / 60)}h ` : ''}${s.delayMinutes! % 60} min late`.replace('h 0 min', 'h')
    : '';
  let subtitle: string;
  if (s.currentStage === 'landed') subtitle = `Landed in ${s.toCode}`;
  else if (s.currentStage === 'departed')
    subtitle = s.estimatedArrival ? `In the air · lands ${fmtTime(s.estimatedArrival)}` : 'In the air';
  else {
    const stageBit = s.currentStage ? `${STAGE_LABELS[s.currentStage] ?? s.currentStage} · ` : '';
    const departureMs = Date.parse(s.estimatedDeparture ?? s.scheduledDeparture);
    subtitle = Number.isNaN(departureMs)
      ? `${stageBit}Departs ${fmtTime(s.estimatedDeparture ?? s.scheduledDeparture)}`
      : `${stageBit}Departs ${countdownBit(departureMs, now)}`;
  }
  if (delayLabel) subtitle = `${delayLabel} · ${subtitle}`;
  return {
    subtitle,
    progress: (stageIndex(s.currentStage) + 1) / STAGE_ORDER.length,
    stageLabel: s.currentStage ? (STAGE_LABELS[s.currentStage] ?? '') : '',
    gate: s.gate ?? '',
    terminal: s.terminal ?? '',
    delayLabel,
    emphasis: delayed ? 'delay' : s.gate ? 'gate' : 'none',
    depTime: fmtTime(s.estimatedDeparture ?? s.scheduledDeparture),
    arrTime: fmtTime(s.estimatedArrival ?? s.scheduledArrival),
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
