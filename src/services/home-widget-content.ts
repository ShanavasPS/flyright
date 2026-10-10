/** What the iOS "Next flight" home-screen widget shows, as a WidgetKit
 * timeline. Pure — the caller reads the journal and the travel-day state —
 * so the whole arc is unit-testable.
 *
 * A widget only re-renders from the entries it was handed, and the app may
 * not run again before the trip. So the timeline carries every moment the
 * card should change by itself: each midnight ("In 3 days" → "In 2 days"),
 * the start of the live window, take-off, landing and the window's close.
 * Countdowns between those moments tick in SwiftUI (Text timer / relative
 * date), never here.
 *
 * The live card — steps, gate, delay — is the same LiveContent the Live
 * Activity draws, and is Pro like it. Without Pro the widget stays the plain
 * next-flight card from the saved journal. */

import { airportZone } from '@/services/airports';
import { countdown, dayOffset, dayOffsetMark, flightInstant, formatDayLabel, formatTime } from '@/services/dates';
import { hasRealTime } from '@/services/notification-plan';
import { cityOf } from '@/services/timeline';
import {
  activeJourney,
  liveContent,
  travelWindow,
  type FlightFacts,
  type StagePlan,
  type TravelDayState,
  type TravelJourney,
} from '@/services/travel-day';

/** The widget's props. JSON only: they cross into the widget's own runtime
 * through the app group, and instants travel as ms (0 = unknown). */
export interface NextFlightProps {
  kind: 'none' | 'upcoming' | 'live';
  /** Where a tap goes: the trip, or adding one. */
  url: string;
  fromCode: string;
  toCode: string;
  fromCity: string;
  toCity: string;
  flightLabel: string;
  /** "Wed, 5 Aug" at the origin airport. */
  dayLabel: string;
  /** "In 2 weeks", "In 3 days" — the My travels header's words. */
  whenLabel: string;
  depTime: string;
  arrTime: string;
  departsAt: number;
  arrivesAt: number;
  /** Live card only (empty otherwise) — see LiveContent. No headline: it
   * is a time-anchored string ("Flight in 3h") that would go stale between
   * entries; the widget runs its own clock to countdownEnd instead. */
  clockLabel: string;
  countdownEnd: number;
  subtitle: string;
  leadLabel: string;
  leadValue: string;
  /** The second fact beside the first (liveLead), '' for none. */
  lead2Label: string;
  lead2Value: string;
  delayChip: string;
  tone: string;
  /** Upcoming flights after this one. */
  laterCount: number;
}

export interface WidgetEntry {
  date: Date;
  props: NextFlightProps;
}

type Row = TravelJourney & { id: string };

export interface WidgetInput {
  rows: Row[];
  stateOf: (journeyId: string) => TravelDayState;
  planOf: (journeyId: string) => StagePlan;
  factsOf: (journeyId: string) => FlightFacts;
  /** Pro: the live card through the travel day. */
  live: boolean;
  now: Date;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** How far ahead the timeline reaches. The app refreshes it on every launch,
 * journal change and background flight check, so a week covers a phone that
 * is simply not opened for a while. */
const HORIZON_MS = 8 * DAY_MS;
const MAX_ENTRIES = 96;
/** Just past a clock moment, as liveContentSchedule steps — the card that
 * follows take-off must be judged after it. */
const JUST_AFTER_MS = 61_000;

const NONE: NextFlightProps = {
  kind: 'none',
  url: 'flyright://add',
  fromCode: '',
  toCode: '',
  fromCity: '',
  toCity: '',
  flightLabel: '',
  dayLabel: '',
  whenLabel: '',
  depTime: '',
  arrTime: '',
  departsAt: 0,
  arrivesAt: 0,
  clockLabel: '',
  countdownEnd: 0,
  subtitle: '',
  leadLabel: '',
  leadValue: '',
  lead2Label: '',
  lead2Value: '',
  delayChip: '',
  tone: 'normal',
  laterCount: 0,
};

const departureOf = (j: Row) => flightInstant(j.scheduledDeparture, airportZone(j.fromCode));
const arrivalOf = (j: Row) => flightInstant(j.scheduledArrival, airportZone(j.toCode));

/** Still ahead at `t`: a timed flight until it leaves; one saved without
 * times (a fabricated noon) for the rest of its day. */
function aheadAt(j: Row, t: number): boolean {
  const dep = departureOf(j);
  if (Number.isNaN(dep)) return false;
  return hasRealTime(j) ? dep > t : dep + 12 * HOUR_MS > t;
}

/** The My travels header's countdown in words ("Next trip in 2 weeks"),
 * from the same `countdown` — so the widget and the app never disagree. */
function whenLabel(j: Row, t: Date): string {
  const { value, unit } = countdown(j.scheduledDeparture, t, airportZone(j.fromCode));
  if (unit === 'now') return 'Boarding soon';
  if (unit.endsWith(' ago')) return '';
  const word = unit.replace(/s$/, '');
  return `In ${value} ${word}${value === 1 ? '' : 's'}`;
}

function base(j: Row, t: Date, laterCount: number): NextFlightProps {
  const timed = hasRealTime(j);
  const dep = departureOf(j);
  const arr = arrivalOf(j);
  return {
    ...NONE,
    kind: 'upcoming',
    url: `flyright://journey/${j.id}`,
    fromCode: j.fromCode,
    toCode: j.toCode,
    fromCity: cityOf(j.fromCode),
    toCity: cityOf(j.toCode),
    flightLabel: j.number || j.carrier,
    dayLabel: formatDayLabel(j.scheduledDeparture, airportZone(j.fromCode)),
    whenLabel: whenLabel(j, t),
    depTime: timed ? formatTime(j.scheduledDeparture, airportZone(j.fromCode)) : '',
    // "12:50⁺¹" for a next-day landing, as the trip rows print it.
    arrTime: timed
      ? formatTime(j.scheduledArrival, airportZone(j.toCode)) +
        dayOffsetMark(dayOffset(j.scheduledDeparture, airportZone(j.fromCode), j.scheduledArrival, airportZone(j.toCode)))
      : '',
    departsAt: timed && !Number.isNaN(dep) ? dep : 0,
    arrivesAt: timed && !Number.isNaN(arr) ? arr : 0,
    laterCount,
  };
}

/** The widget as it should read at `t`. */
export function widgetPropsAt(input: WidgetInput, t: Date): NextFlightProps {
  const flights = input.rows.filter((j) => j.mode === 'flight');
  const ahead = flights
    .filter((j) => aheadAt(j, t.getTime()))
    .sort((a, b) => departureOf(a) - departureOf(b));

  if (input.live) {
    const active = activeJourney(flights, t, input.stateOf, input.planOf);
    if (active) {
      const state = input.stateOf(active.id);
      const plan = input.planOf(active.id);
      // Live from four hours out, or earlier once the traveller has tapped a
      // step — the same rule that starts the Live Activity.
      const { phase } = travelWindow(active, state, t, plan);
      if (phase === 'live' || (phase === 'reminder' && state.stage)) {
        const c = liveContent(active, state, input.factsOf(active.id), t, plan);
        const later = ahead.filter((j) => j.id !== active.id).length;
        return {
          ...base(active, t, later),
          kind: 'live',
          depTime: c.depTime ?? '',
          arrTime: c.arrTime ?? '',
          departsAt: c.departsAt ?? 0,
          arrivesAt: c.arrivesAt ?? 0,
          clockLabel: c.clockLabel,
          countdownEnd: c.countdownEnd ?? 0,
          subtitle: c.subtitle,
          leadLabel: c.lead?.label ?? '',
          leadValue: c.lead?.value ?? '',
          lead2Label: c.second?.label ?? '',
          lead2Value: c.second?.value ?? '',
          delayChip: c.delayChip ?? '',
          tone: c.tone,
        };
      }
    }
  }

  const next = ahead[0];
  return next ? base(next, t, ahead.length - 1) : NONE;
}

/** Every moment at which the widget's content changes, from `now` to the
 * horizon, each with the props it shows from then on. */
export function widgetTimeline(input: WidgetInput): WidgetEntry[] {
  const now = input.now.getTime();
  const end = now + HORIZON_MS;
  const moments = new Set<number>([now]);

  // `countdown` rounds elapsed time, so "In 3 days" turns over at no fixed
  // clock: a six-hour grid keeps the words at most that stale, and hours
  // ("In 30 hours") get an entry each in the two days before take-off.
  const grid = Math.ceil(now / (6 * HOUR_MS)) * 6 * HOUR_MS;
  for (let m = grid; m < end; m += 6 * HOUR_MS) moments.add(m);

  for (const j of input.rows) {
    if (j.mode !== 'flight') continue;
    const dep = departureOf(j);
    if (Number.isNaN(dep) || dep + 2 * DAY_MS < now || dep > end) continue;
    const arr = arrivalOf(j);
    moments.add(hasRealTime(j) ? dep : dep + 12 * HOUR_MS);
    for (let h = 1; h <= 48; h++) moments.add(dep - h * HOUR_MS);
    if (input.live) {
      const { startsAt, endsAt } = travelWindow(j, input.stateOf(j.id), input.now, input.planOf(j.id));
      if (startsAt) moments.add(dep - 4 * HOUR_MS);
      if (endsAt) moments.add(endsAt.getTime());
      moments.add(dep + JUST_AFTER_MS);
      if (!Number.isNaN(arr)) moments.add(arr + JUST_AFTER_MS);
    }
  }

  const entries: WidgetEntry[] = [];
  let last = '';
  for (const at of [...moments].filter((m) => m >= now && m < end).sort((a, b) => a - b)) {
    const date = new Date(at);
    const props = widgetPropsAt(input, date);
    const key = JSON.stringify(props);
    if (key === last) continue;
    last = key;
    entries.push({ date, props });
    if (entries.length >= MAX_ENTRIES) break;
  }
  return entries;
}
