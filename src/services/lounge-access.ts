/** Which airport lounges a traveller can use before a departure, and how
 * (docs/lounges.md). Pure: the lounge directory, the trip's facts and the
 * traveller's memberships and passes come in; a verdict per lounge comes
 * out. Nothing here fetches, stores or shows anything.
 *
 * FlyRight is never what the lounge desk scans, so a verdict is a promise
 * only when the evidence is on the booking: a premium cabin, or a status
 * whose member number the boarding pass carries. A status the traveller
 * typed is "likely" until then, with the fix to make it certain. */

import { type LoungeRecord } from '../../convex/loungeShared';
import { type CabinClass } from '@/services/cabin';
import { allianceLevelOf, allianceOf, type AllianceLevel, type MembershipLike } from '@/services/loyalty-programmes';

/** One lounge as the directory describes it (convex/loungeShared). Hours
 * are the airport's local clock; a close earlier than the open runs past
 * midnight. */
export type Lounge = LoungeRecord;

/** Lounge networks a pass can belong to. */
export type LoungeNetwork = NonNullable<Lounge['access']['networks']>[number];

export interface Money {
  /** Minor units: 3500 for €35. */
  amount: number;
  currency: string;
}

/** The departure the lounges are for. */
export interface LoungeDeparture {
  airport: string;
  /** IATA code of the airline flying it, e.g. "AY". */
  carrier: string | null;
  cabin: CabinClass | null;
  terminal: string | null;
  /** Whether the traveller goes through passport control on this leg
   *  (travel-day-plan's border rule); null when unknown. */
  crossesBorder: boolean | null;
  /** Whether the flight leaves the country; null when unknown. */
  international: boolean | null;
  /** Scheduled departure on the airport's local clock, 'HH:MM'. */
  departsLocal: string;
}

/** A membership with what the booking says about it. */
export interface StatusEvidence {
  membership: MembershipLike;
  /** Whether this booking carries the member number (the boarding pass's
   *  frequent flyer fields): true, false, or null when nobody has read one. */
  onBooking: boolean | null;
}

export interface LoungePass {
  id: string;
  network: LoungeNetwork;
  /** Free visits left this membership year; null for unlimited or unknown. */
  visitsLeft: number | null;
  /** What a visit past the allowance costs. */
  extraVisit: Money | null;
}

export type LoungeVerdict = 'included' | 'likely' | 'visit' | 'pay' | 'closed' | 'no';

export type LoungeWay =
  | { kind: 'cabin'; cabin: CabinClass }
  | { kind: 'status'; membershipId: string; level: AllianceLevel }
  | { kind: 'pass'; passId: string; visitsLeft: number | null }
  | { kind: 'pay'; price: Money; passId: string | null };

/** Why a "likely" isn't "included", or why a lounge is out of reach. */
export type LoungeFix =
  | 'number-not-on-booking'
  | 'booking-not-read'
  | 'status-may-have-ended'
  | 'free-visits-used'
  | 'closed-at-departure'
  | 'other-terminal'
  | 'past-passport-control';

export interface LoungeOption {
  lounge: Lounge;
  verdict: LoungeVerdict;
  way: LoungeWay | null;
  fix: LoungeFix | null;
}

/** How long before departure the traveller would still be in the lounge;
 * a lounge closed at that moment is no use for this flight. */
const LAST_USEFUL_MINUTES = 60;

const RANK: Record<LoungeVerdict, number> = { included: 0, likely: 1, visit: 2, pay: 3, closed: 4, no: 5 };

/** Every lounge at the departure airport with its verdict, best first:
 * free and certain, free and likely, a pass visit, paid, then the ones out
 * of reach. A free way in always beats spending a pass visit. */
export function loungeOptions(
  lounges: Lounge[],
  departure: LoungeDeparture,
  statuses: StatusEvidence[],
  passes: LoungePass[],
  /** The month today is in, 'YYYY-MM', for tier expiry. */
  thisMonth: string,
): LoungeOption[] {
  return lounges
    .filter((lounge) => lounge.airport === departure.airport)
    .map((lounge) => optionFor(lounge, departure, statuses, passes, thisMonth))
    .sort(
      (a, b) =>
        RANK[a.verdict] - RANK[b.verdict] || breadth(a) - breadth(b) || a.lounge.name.localeCompare(b.lounge.name),
    );
}

/** How many kinds of traveller the way in admits: among lounges equally
 * open to this traveller, the one fewer others can use comes first (the
 * Platinum Wing before the business lounge, Al Safwa before Al Mourjan). */
function breadth(option: LoungeOption): number {
  const { access } = option.lounge;
  switch (option.way?.kind) {
    case 'status':
      return access.status?.levels.length ?? 0;
    case 'cabin':
      return access.cabin?.cabins.length ?? 0;
    default:
      return 0;
  }
}

function optionFor(
  lounge: Lounge,
  departure: LoungeDeparture,
  statuses: StatusEvidence[],
  passes: LoungePass[],
  thisMonth: string,
): LoungeOption {
  if (lounge.terminal && departure.terminal && lounge.terminal !== departure.terminal) {
    return { lounge, verdict: 'no', way: null, fix: 'other-terminal' };
  }
  if (lounge.afterPassportControl === true && departure.crossesBorder === false) {
    return { lounge, verdict: 'no', way: null, fix: 'past-passport-control' };
  }

  const best = bestWay(lounge, departure, statuses, passes, thisMonth);
  if (best.verdict !== 'no' && !openBefore(lounge, departure.departsLocal)) {
    return { lounge, verdict: 'closed', way: best.way, fix: 'closed-at-departure' };
  }
  return { lounge, ...best };
}

function bestWay(
  lounge: Lounge,
  departure: LoungeDeparture,
  statuses: StatusEvidence[],
  passes: LoungePass[],
  thisMonth: string,
): Omit<LoungeOption, 'lounge'> {
  const { access } = lounge;

  const cabin = departure.cabin;
  // Unknown counts as international, as for status: the desk decides.
  const cabinCounts = !access.cabin?.internationalOnly || departure.international !== false;
  if (access.cabin && cabin && access.cabin.cabins.includes(cabin) && departure.carrier && cabinCounts) {
    const byCarrier = access.cabin.carriers?.includes(departure.carrier) ?? false;
    const byAlliance = !!access.cabin.alliance && allianceOf(departure.carrier) === access.cabin.alliance;
    if (byCarrier || byAlliance || access.cabin.anyCarrier) return { verdict: 'included', way: { kind: 'cabin', cabin }, fix: null };
  }

  const status = statusWay(lounge, departure, statuses, thisMonth);
  if (status) return status;

  const usable = passes.filter((p) => access.networks?.includes(p.network));
  const withVisits = usable.find((p) => p.visitsLeft == null || p.visitsLeft > 0);
  if (withVisits) {
    return { verdict: 'visit', way: { kind: 'pass', passId: withVisits.id, visitsLeft: withVisits.visitsLeft }, fix: null };
  }
  const extra = usable.find((p) => p.extraVisit);
  if (extra?.extraVisit) {
    return { verdict: 'pay', way: { kind: 'pay', price: extra.extraVisit, passId: extra.id }, fix: 'free-visits-used' };
  }
  if (access.door) return { verdict: 'pay', way: { kind: 'pay', price: access.door, passId: null }, fix: null };
  return { verdict: 'no', way: null, fix: null };
}

function statusWay(
  lounge: Lounge,
  departure: LoungeDeparture,
  statuses: StatusEvidence[],
  thisMonth: string,
): Omit<LoungeOption, 'lounge'> | null {
  const rule = lounge.access.status;
  if (!rule || !departure.carrier || allianceOf(departure.carrier) !== rule.alliance) return null;
  // Unknown counts as international: the desk decides, and "likely" says so.
  if (rule.internationalOnly && departure.international === false) return null;

  const matches = statuses
    .map((evidence) => ({ evidence, level: allianceLevelOf(evidence.membership) }))
    .filter((m): m is { evidence: StatusEvidence; level: AllianceLevel } => !!m.level && rule.levels.includes(m.level));
  if (matches.length === 0) return null;

  const current = (m: { evidence: StatusEvidence }) =>
    !m.evidence.membership.tierUntil || m.evidence.membership.tierUntil >= thisMonth;
  const certain = matches.find((m) => current(m) && m.evidence.onBooking === true);
  const pick = certain ?? matches.find(current) ?? matches[0];
  const way: LoungeWay = { kind: 'status', membershipId: pick.evidence.membership.id, level: pick.level };
  if (certain) return { verdict: 'included', way, fix: null };
  if (!current(pick)) return { verdict: 'likely', way, fix: 'status-may-have-ended' };
  return {
    verdict: 'likely',
    way,
    fix: pick.evidence.onBooking === false ? 'number-not-on-booking' : 'booking-not-read',
  };
}

/** Whether the lounge is open at some point in the last useful hour before
 * departure; unknown hours count as open. */
function openBefore(lounge: Lounge, departsLocal: string): boolean {
  if (!lounge.hours) return true;
  const open = minutes(lounge.hours.open);
  const close = minutes(lounge.hours.close);
  const departs = minutes(departsLocal);
  if (open == null || close == null || departs == null) return true;
  if (open === close || (open === 0 && close === 24 * 60)) return true;
  const day = 24 * 60;
  const visit = (departs - LAST_USEFUL_MINUTES + day) % day;
  return isOpenAt(open, close, visit);
}

function isOpenAt(open: number, close: number, at: number): boolean {
  // A close at or before the open runs past midnight.
  return close > open ? at >= open && at < close : at >= open || at < close;
}

function minutes(hhmm: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const value = Number(match[1]) * 60 + Number(match[2]);
  return value <= 24 * 60 ? value : null;
}
