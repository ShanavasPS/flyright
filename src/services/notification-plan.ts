/** Pure planning for the notification lifecycle — no expo-notifications, no
 * DB, no OneSignal, so the whole schedule is unit-testable. The lifecycle
 * service (notification-lifecycle.ts) turns a plan into scheduled
 * notifications and cancels whatever fell out of it. */

import { evaluate } from '@/rules/engine';
import type { Journey } from '@/rules/types';
import { formatDayLabel, formatTime } from '@/services/dates';
import type { JourneyRow } from '@/services/journeys';
import { cityOf } from '@/services/timeline';

export interface PlannedReminder {
  /** Doubles as the notification identifier — rescheduling the same id
   * replaces the previous request, which is what makes reconcile idempotent. */
  id: string;
  title: string;
  body: string;
  fireDate: Date;
  /** Deep link pushed when the user taps the notification. */
  url: string;
}

export type ReminderJourney = Pick<
  JourneyRow,
  'id' | 'number' | 'carrier' | 'toCode' | 'source' | 'scheduledDeparture' | 'scheduledArrival'
>;

export interface ReminderClaim {
  id: string;
  status: string;
  responseDeadline: string | null;
  amount: number;
  currency: string;
  journey: ReminderJourney;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Every scheduled identifier the lifecycle owns. Reconcile only ever cancels
 * within this namespace, so it can never touch OneSignal's remote pushes or
 * anything another module schedules. */
export const OWNED_ID = /^(trip|claim-week|claim-due|delay|travel-day)-/;

const flightLabel = (j: ReminderJourney) => j.number || j.carrier;

/** Manual entries store a noon departure = arrival pair when the user never
 * entered times — don't announce a fabricated "departs at 12:00". */
export function hasRealTime(
  j: Pick<ReminderJourney, 'source' | 'scheduledDeparture' | 'scheduledArrival'>,
): boolean {
  if (j.source !== 'manual') return true;
  return !(j.scheduledDeparture === j.scheduledArrival && j.scheduledDeparture.endsWith('T12:00:00'));
}

function tripReminder(j: ReminderJourney, now: Date): PlannedReminder | null {
  const departure = Date.parse(j.scheduledDeparture);
  if (Number.isNaN(departure)) return null;
  const fireDate = new Date(departure - DAY_MS);
  if (fireDate.getTime() <= now.getTime()) return null;

  const watching =
    j.source === 'lookup'
      ? "FlyRight is watching it — if it runs late, you'll know what you're owed."
      : 'Safe travels! Your journal has the trip covered.';
  const when = hasRealTime(j) ? `Departs ${formatTime(j.scheduledDeparture)}. ` : '';

  return {
    id: `trip-${j.id}`,
    title: `${flightLabel(j)} to ${cityOf(j.toCode)} tomorrow`,
    body: `${when}${watching}`,
    fireDate,
    url: `/journey/${j.id}`,
  };
}

function claimReminders(c: ReminderClaim, now: Date): PlannedReminder[] {
  if (c.status !== 'sent' || !c.responseDeadline) return [];
  const deadline = Date.parse(c.responseDeadline);
  if (Number.isNaN(deadline)) return [];

  const label = flightLabel(c.journey);
  const money = `${c.amount} ${c.currency}`;
  const out: PlannedReminder[] = [];

  const weekBefore = new Date(deadline - 7 * DAY_MS);
  if (weekBefore.getTime() > now.getTime()) {
    out.push({
      id: `claim-week-${c.id}`,
      title: `${c.journey.carrier} has one week left to reply`,
      body: `Your ${money} claim for ${label} hits its six-week deadline on ${formatDayLabel(
        c.responseDeadline,
      )}. No answer by then means it's time to escalate.`,
      fireDate: weekBefore,
      url: '/claims',
    });
  }

  if (deadline > now.getTime()) {
    out.push({
      id: `claim-due-${c.id}`,
      title: 'Six weeks are up — time to escalate',
      body: `${c.journey.carrier} never settled your ${money} claim for ${label}. Open FlyRight to see your next options.`,
      fireDate: new Date(deadline),
      url: '/claims',
    });
  }

  return out;
}

/** The complete desired schedule for a viewer's journal: a pre-trip reminder
 * per upcoming journey, and the six-week countdown pair per sent claim. */
export function planReminders(
  journeys: ReminderJourney[],
  claims: ReminderClaim[],
  now: Date,
): PlannedReminder[] {
  const plan: PlannedReminder[] = [];
  for (const j of journeys) {
    const trip = tripReminder(j, now);
    if (trip) plan.push(trip);
  }
  for (const c of claims) plan.push(...claimReminders(c, now));
  return plan;
}

/** Escalation ladder for live delay alerts: one notification when a delay
 * first becomes worth mentioning, one more if it crosses into compensation
 * territory — never a repeat at the same tier. */
export type DelayTier = 'none' | 'info' | 'money';

export function delayTier(journey: Journey, delayMinutes: number): DelayTier {
  const verdict = evaluate(journey, { type: 'delay', delayMinutes });
  if (verdict.eligible && verdict.compensation) return 'money';
  return delayMinutes >= 30 ? 'info' : 'none';
}

const TIER_RANK: Record<DelayTier, number> = { none: 0, info: 1, money: 2 };

export const outranks = (a: DelayTier, b: DelayTier) => TIER_RANK[a] > TIER_RANK[b];

export function formatDelay(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function delayNotification(
  journey: Journey,
  delayMinutes: number,
  tier: Exclude<DelayTier, 'none'>,
): { id: string; title: string; body: string; url: string } {
  const label = journey.number || journey.carrier;
  const base = { id: `delay-${journey.id}`, url: `/journey/${journey.id}` };
  if (tier === 'money') {
    const verdict = evaluate(journey, { type: 'delay', delayMinutes });
    const money = verdict.compensation
      ? `${verdict.compensation.amount} ${verdict.compensation.currency}`
      : 'compensation';
    return {
      ...base,
      title: `${label} delayed — you're likely owed ${money}`,
      body: `Running ${formatDelay(delayMinutes)} late. ${
        verdict.regulation ?? 'Passenger rights'
      } compensation applies — start your claim in FlyRight.`,
    };
  }
  return {
    ...base,
    title: `${label} is running late`,
    body: `Current delay: ${formatDelay(delayMinutes)}. FlyRight will tell you if it reaches compensation territory.`,
  };
}
