/** Lounge access for one saved trip (docs/lounges.md): the trip's facts as
 * the engine wants them, what its boarding pass says about the traveller's
 * memberships, and the one line the airport card shows before the day.
 * Pure; the trip page and the travel-day card call it. */

import { getAirport } from '@/services/airports';
import { parseBcbp } from '@/services/bcbp';
import { legFor } from '@/services/boarding-pass';
import { isCabin } from '@/services/cabin';
import { wallClock } from '@/services/dates';
import { type LoungeDeparture, type LoungeOption, type StatusEvidence } from '@/services/lounge-access';
import { carrierCode, programmeById, type MembershipLike } from '@/services/loyalty-programmes';
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

/** The departure as the engine wants it, or null when the trip lacks what
 * a verdict needs (an airport, a departure time). */
export function loungeDeparture(trip: LoungeTrip, zone: string | null): LoungeDeparture | null {
  const departsLocal = wallClock(trip.scheduledDeparture, zone);
  if (!trip.fromCode || !departsLocal) return null;
  const from = getAirport(trip.fromCode)?.country;
  const to = getAirport(trip.toCode)?.country;
  return {
    airport: trip.fromCode.toUpperCase(),
    carrier: carrierCode(trip.number),
    cabin: isCabin(trip.cabin) ? trip.cabin : null,
    terminal: trip.terminal?.trim() || null,
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
