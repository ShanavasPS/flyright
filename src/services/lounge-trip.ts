/** Lounge access for one saved trip (docs/lounges.md): the trip's facts as
 * the engine wants them, what its boarding pass says about the traveller's
 * memberships, and the one line the airport card shows before the day.
 * Pure; the trip page and the travel-day card call it. */

import { getAirport } from '@/services/airports';
import { parseBcbp } from '@/services/bcbp';
import { legFor } from '@/services/boarding-pass';
import { flightInstant, formatTime, wallClock } from '@/services/dates';
import { cabinLabel, isCabin } from '@/services/cabin';
import { type LoungeDeparture, type LoungeOption, type Money, type StatusEvidence } from '@/services/lounge-access';
import {
  carrierCode,
  describeMembership,
  programmeById,
  PROGRAMMES,
  tierLine,
  type AllianceLevel,
  type MembershipLike,
} from '@/services/loyalty-programmes';
import { crossesPassportControl } from '@/services/travel-day-plan';

/** The journey columns lounge access reads. */
export interface LoungeTrip {
  number: string;
  fromCode: string;
  toCode: string;
  scheduledDeparture: string;
  cabin: string | null;
  terminal: string | null;
  passCode: string | null;
}

/** What the airport has posted since the trip was saved: a terminal, a
 * boarding time, a new departure time (services/travel-day FlightFacts). */
export interface LoungeFacts {
  terminal: string | null;
  boardingTime: string | null;
  estimatedDeparture: string | null;
  delayMinutes?: number | null;
}

/** The departure as the engine wants it, or null when the trip lacks what
 * a verdict needs (an airport, a departure time). A delay moves it. */
export function loungeDeparture(trip: LoungeTrip, zone: string | null, facts?: LoungeFacts): LoungeDeparture | null {
  const departsLocal = wallClock(facts?.estimatedDeparture ?? trip.scheduledDeparture, zone);
  if (!trip.fromCode || !departsLocal) return null;
  const from = getAirport(trip.fromCode)?.country;
  const to = getAirport(trip.toCode)?.country;
  return {
    airport: trip.fromCode.toUpperCase(),
    carrier: carrierCode(trip.number),
    cabin: isCabin(trip.cabin) ? trip.cabin : null,
    terminal: facts?.terminal?.trim() || trip.terminal?.trim() || null,
    crossesBorder: crossesPassportControl(trip.fromCode, trip.toCode),
    international: from && to ? from !== to : null,
    departsLocal,
  };
}

const bare = (number: string) => number.replace(/[\s-]/g, '').toUpperCase();

/** Whether the boarding pass carries a membership's number: true when it
 * does, false when it carries another number for that programme's
 * airlines, null when there is no pass or the pass leaves the fields blank
 * (blank means unknown, not "no membership"). */
export function onBooking(trip: LoungeTrip, membership: MembershipLike): boolean | null {
  if (!trip.passCode) return null;
  const pass = parseBcbp(trip.passCode);
  const leg = pass ? legFor(pass, trip) : null;
  const flyer = leg?.frequentFlyer;
  if (!flyer) return null;
  const mine = bare(membership.number);
  // Airlines print the number with or without their own prefix.
  if (mine && (flyer.number === mine || flyer.number.endsWith(mine) || mine.endsWith(flyer.number))) return true;
  const carriers = programmeById(membership.programme)?.carriers ?? [];
  return carriers.includes(flyer.airline) ? false : null;
}

export function statusEvidence(trip: LoungeTrip, memberships: MembershipLike[]): StatusEvidence[] {
  return memberships.map((membership) => ({ membership, onBooking: onBooking(trip, membership) }));
}

/** The airport card's lounge line before the day, or null when there is
 * nothing to say: "2 lounges you can use", then the best one and how sure
 * it is ("Finnair Platinum Wing included"). Without a membership or a
 * premium cabin it says how to find out. */
export function loungeLine(
  options: LoungeOption[],
  hasMemberships: boolean,
): { title: string; detail: string | null } | null {
  if (options.length === 0) return null;
  const usable = options.filter((o) => o.verdict === 'included' || o.verdict === 'likely' || o.verdict === 'visit');
  const count = (n: number, what: string) => `${n} ${n === 1 ? 'lounge' : 'lounges'} ${what}`;
  if (usable.length === 0) {
    if (hasMemberships) return null;
    return {
      title: count(options.length, `at ${options[0].lounge.airport}`),
      detail: 'Add a membership to see which you can use',
    };
  }
  const best = usable[0];
  const how = best.verdict === 'included' ? 'included' : best.verdict === 'likely' ? 'likely' : 'with your pass';
  return { title: count(usable.length, 'you can use'), detail: `${best.lounge.name} ${how}` };
}

/** Minutes between leaving a lounge and boarding: the walk, unknown for
 * now, and a margin. Never later than this before boarding. */
const LEAVE_BEFORE_BOARDING = 15;
/** Boarding usually opens this long before departure. */
const BOARDING_BEFORE_DEPARTURE = 30;

/** When to leave a lounge, as an instant: the posted boarding time, else
 * the departure (delayed when it is), less the margin. */
export function leaveBy(trip: LoungeTrip, zone: string | null, facts?: LoungeFacts): number | null {
  const minute = 60_000;
  if (facts?.boardingTime) {
    const boarding = Date.parse(facts.boardingTime);
    if (!Number.isNaN(boarding)) return boarding - LEAVE_BEFORE_BOARDING * minute;
  }
  const departure = flightInstant(facts?.estimatedDeparture ?? trip.scheduledDeparture, zone);
  if (Number.isNaN(departure)) return null;
  return departure - (BOARDING_BEFORE_DEPARTURE + LEAVE_BEFORE_BOARDING) * minute;
}

/** "14:55" on the airport's clock. */
export function leaveByLabel(instant: number, zone: string | null): string {
  return formatTime(new Date(instant).toISOString(), zone);
}

const LEVEL_NAMES: Record<AllianceLevel, string> = {
  ruby: 'oneworld Ruby',
  sapphire: 'oneworld Sapphire',
  emerald: 'oneworld Emerald',
  'star-silver': 'Star Alliance Silver',
  'star-gold': 'Star Alliance Gold',
  elite: 'SkyTeam Elite',
  'elite-plus': 'SkyTeam Elite Plus',
};

export function levelName(level: AllianceLevel): string {
  return LEVEL_NAMES[level];
}

/** "€45" for a price in minor units. */
export function priceLabel(price: Money): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: price.currency, maximumFractionDigits: 0 }).format(
      price.amount / 100,
    );
  } catch {
    return `${Math.round(price.amount / 100)} ${price.currency}`;
  }
}

/** The chip beside a lounge: what the verdict means at the desk. */
export function verdictLabel(option: LoungeOption): { text: string; tone: 'success' | 'warning' | 'neutral' } {
  switch (option.verdict) {
    case 'included':
      return { text: 'Included', tone: 'success' };
    case 'likely':
      return option.fix === 'status-may-have-ended' ? { text: 'Check status', tone: 'warning' } : { text: 'Likely', tone: 'warning' };
    case 'visit':
      return { text: '1 visit', tone: 'neutral' };
    case 'pay':
      return { text: option.way?.kind === 'pay' ? priceLabel(option.way.price) : 'Pay', tone: 'neutral' };
    case 'closed':
      return { text: 'Closed by then', tone: 'neutral' };
    case 'no':
      return { text: 'Not for this flight', tone: 'neutral' };
  }
}

/** How the traveller gets in, in a few words: "Finnair Plus Platinum ·
 * oneworld Emerald", "Business on AY5", "Priority Pass · 5 free visits
 * left", "Pay at the desk". `passName` names a pass by its id. */
export function wayLine(
  option: LoungeOption,
  memberships: MembershipLike[],
  flight: string,
  passName: (id: string) => string | null = () => null,
): string | null {
  const way = option.way;
  if (!way) return null;
  switch (way.kind) {
    case 'cabin':
      return `${cabinLabel(way.cabin)} on ${flight}`;
    case 'status': {
      const m = memberships.find((x) => x.id === way.membershipId);
      const name = m ? `${describeMembership(m).name} ${m.tier ?? ''}`.trim() : null;
      return name ? `${name} · ${levelName(way.level)}` : levelName(way.level);
    }
    case 'pass': {
      const name = passName(way.passId) ?? 'Lounge pass';
      if (way.visitsLeft == null) return `${name} · unlimited visits`;
      return `${name} · ${way.visitsLeft} free ${way.visitsLeft === 1 ? 'visit' : 'visits'} left`;
    }
    case 'pay':
      return way.passId ? 'Your free visits are used' : 'Pay at the desk';
  }
}

/** Why it isn't certain, and what to do (design A2 states). */
export function fixLine(option: LoungeOption, memberships: MembershipLike[], hasPass: boolean): string | null {
  const way = option.way;
  const m = way?.kind === 'status' ? memberships.find((x) => x.id === way.membershipId) : undefined;
  const programme = m ? describeMembership(m).name : 'your membership';
  const airline = m ? describeMembership(m).airline : 'the airline';
  switch (option.fix) {
    case 'number-not-on-booking':
      return `Your boarding pass has no ${programme} number, so the desk may not see your ${m?.tier ?? 'status'}. Add it in ${airline}'s app before the airport, or ask at check-in.`;
    case 'booking-not-read':
      return hasPass
        ? `The desk sees your status through the ${programme} number on your booking, and your boarding pass doesn't show it. Check it's on the booking in ${airline}'s app.`
        : `The desk sees your status through the ${programme} number on your booking. Save your boarding pass to check it's there.`;
    case 'status-may-have-ended':
      return `Memberships has ${(m && tierLine(m)) ?? 'a status that may have ended'}. Check it with ${airline}, then update Memberships.`;
    case 'free-visits-used':
      return 'Your free visits are used for this membership year.';
    case 'closed-at-departure':
      return 'It closes before your flight.';
    default:
      return null;
  }
}

/** What a trip's boarding pass says about the traveller's memberships
 * (design B4): the frequent flyer number on the booking, which saved
 * membership it is, and fast track. Null without a readable pass or when
 * the pass leaves the fields blank. The full number is never returned —
 * only its last four, and the programme it belongs to. */
export interface PassLoyalty {
  /** The airline code the pass files the number under, e.g. "AY". */
  airline: string;
  last4: string;
  /** The catalogue programme of that airline, when there is one. */
  programme: { id: string; name: string } | null;
  /** The saved membership with this number, if any. */
  matchId: string | null;
  /** A membership of the same programme is saved, with another number. */
  otherNumberSaved: boolean;
  fastTrack: boolean | null;
}

export function passLoyalty(trip: LoungeTrip, memberships: MembershipLike[]): PassLoyalty | null {
  if (!trip.passCode) return null;
  const pass = parseBcbp(trip.passCode);
  const leg = pass ? legFor(pass, trip) : null;
  const flyer = leg?.frequentFlyer;
  if (!leg || !flyer) return null;
  const programme = PROGRAMMES.find((p) => p.carriers.includes(flyer.airline)) ?? null;
  const match = memberships.find((m) => onBooking(trip, m) === true) ?? null;
  return {
    airline: flyer.airline,
    last4: flyer.number.slice(-4),
    programme: programme ? { id: programme.id, name: programme.name } : null,
    matchId: match?.id ?? null,
    otherNumberSaved: !match && !!programme && memberships.some((m) => m.programme === programme.id),
    fastTrack: leg.fastTrack,
  };
}

/** The membership a pass carries, ready for the add form (design B5):
 * programme and full number. Only for the form on this phone. */
export function membershipFromPass(trip: LoungeTrip): { programme: string; number: string } | null {
  if (!trip.passCode) return null;
  const pass = parseBcbp(trip.passCode);
  const flyer = pass ? legFor(pass, trip)?.frequentFlyer : null;
  const programme = flyer ? PROGRAMMES.find((p) => p.carriers.includes(flyer.airline)) : null;
  return flyer && programme ? { programme: programme.id, number: flyer.number } : null;
}

/** Below this, a connection has no time for a lounge: the card stays away
 * and the traveller goes to the gate (design A4). */
export const SHORT_CONNECTION_MINUTES = 60;
/** From this, a stop is a long layover (design U3). */
export const LONG_LAYOVER_MINUTES = 240;
/** From this, a delay is long enough for airline vouchers to be worth asking about. */
export const VOUCHER_DELAY_MINUTES = 120;

/** "2 h 55 min", "45 min", "9 h". */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

/** The previous leg of the same itinerary, as far as a connection needs it. */
export interface InboundLeg {
  toCode: string;
  scheduledArrival: string;
  actualArrival?: string | null;
}

/** Minutes on the ground between the inbound leg and this departure (a
 * delay on either side moves it); null when the legs don't meet at this
 * airport or a time doesn't read. */
export function connectionMinutes(
  inbound: InboundLeg,
  trip: Pick<LoungeTrip, 'fromCode' | 'scheduledDeparture'>,
  zone: string | null,
  facts?: LoungeFacts,
): number | null {
  if (inbound.toCode.toUpperCase() !== trip.fromCode.toUpperCase()) return null;
  const landed = flightInstant(inbound.actualArrival ?? inbound.scheduledArrival, zone);
  const leaves = flightInstant(facts?.estimatedDeparture ?? trip.scheduledDeparture, zone);
  if (Number.isNaN(landed) || Number.isNaN(leaves)) return null;
  return Math.round((leaves - landed) / 60_000);
}

/** On a delay that moves the leave-by time later (design U1): how late,
 * and the leave-by time it replaces. Null when on time. */
export function delayNote(
  trip: LoungeTrip,
  zone: string | null,
  facts: LoungeFacts | undefined,
): { minutes: number; was: number } | null {
  const minutes = facts?.delayMinutes ?? 0;
  if (minutes < 15) return null;
  const was = leaveBy(trip, zone);
  const now = leaveBy(trip, zone, facts);
  return was != null && now != null && now > was ? { minutes, was } : null;
}
