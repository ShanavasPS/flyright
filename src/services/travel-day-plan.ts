/** Which stages a leg's travel day has, from where it sits in its itinerary.
 *
 * A direct flight walks the whole airport: arrive, check in, drop the bags,
 * security, passport control, gate — then flies, and its day ends at the
 * landing. A connecting leg starts airside: the first three are done, and
 * passport control moves to AFTER the landing, where the trip enters the
 * country; the last leg ends with the bags off the belt. A US airport is a
 * first point of entry: everyone arriving from abroad clears immigration and
 * customs with their bags there, then drops them again for the onward
 * flight — so that leg gets the belt and the re-drop, and the domestic leg
 * after it only the belt. The same reclaim happens wherever an
 * international leg connects to a domestic one, since a domestic arrival
 * has no customs; the EU is the exception (bags check through to the last
 * Schengen stop), so it is modelled as one passport zone.
 *
 * Pure over the journal — the model itself (travel-day.ts) takes the
 * resulting plan and knows nothing about airports. */

import { chainLegs, instantWith, type LegLike } from '../../convex/itineraryShared';

import { airportZone, getAirport } from '@/services/airports';
import {
  DEFAULT_PLAN,
  STAGE_ORDER,
  stagePlan,
  type LegPlace,
  type StagePlan,
} from '@/services/travel-day';

const instant = instantWith(airportZone);

/** One passport zone: a flight between two of these is domestic as far as
 * passport control goes, and checked bags run through to the last stop. */
const SCHENGEN = new Set([
  'AT', 'BE', 'BG', 'HR', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IT', 'LV',
  'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH',
]);

/** Countries that put every arrival from abroad through immigration and
 * customs — bags in hand — at the first airport, connecting or not. */
const CLEARS_AT_FIRST_AIRPORT = new Set(['US']);

const zoneOf = (iata: string): string | null => {
  const country = getAirport(iata)?.country;
  if (!country) return null;
  return SCHENGEN.has(country) ? 'SCHENGEN' : country;
};

/** Whether a leg crosses a passport border. An airport the table doesn't
 * know counts as crossing one: a passport row that goes unused costs a
 * skip, a missing one costs a step. */
const crossesBorder = (leg: LegLike): boolean => {
  const from = zoneOf(leg.fromCode);
  const to = zoneOf(leg.toCode);
  return !from || !to || from !== to;
};

/** Whether a flight between two airports goes through passport control,
 * for lounge access (services/lounge-trip); null when either airport is
 * unknown, where crossesBorder assumes it does. */
export function crossesPassportControl(fromCode: string, toCode: string): boolean | null {
  const from = zoneOf(fromCode);
  const to = zoneOf(toCode);
  return from && to ? from !== to : null;
}

type Leg = LegLike & { id: string };

/** Whether an airport is in the traveller's home city at a moment (the home
 * base on that day); null when no home is known. Built by homeCheck in
 * services/home-base so this module stays free of the home-base state. */
export type IsHome = (iata: string, at: string) => boolean | null;

function placeInChain(chain: Leg[], i: number, isHome?: IsHome): LegPlace {
  const leg = chain[i]!;
  const connecting = i > 0;
  const next = chain[i + 1];
  const onward = !!next;
  // The doors either side of the trip: leaving home (or the hotel, on the
  // way back) and arriving at the hotel (or home). No home base reads as
  // setting off from home to somewhere else.
  const first = chain[0]!;
  const last = chain[chain.length - 1]!;
  const fromHome = isHome?.(first.fromCode, first.scheduledDeparture) ?? true;
  const toHome = isHome?.(last.toCode, last.scheduledArrival) ?? false;
  // A flight on its own keeps the walk it always had: the arrival steps
  // are an itinerary's, where the landing is a stop rather than the end.
  if (!connecting && !onward) {
    return { connecting: false, onward: false, entersHere: false, bagsHere: false, fromHome, toHome };
  }
  const country = getAirport(leg.toCode)?.country ?? null;
  const entersHere =
    crossesBorder(leg) &&
    (!next || !crossesBorder(next) || (country !== null && CLEARS_AT_FIRST_AIRPORT.has(country)));
  const bagsHere = !onward || (entersHere && zoneOf(leg.toCode) !== 'SCHENGEN');
  return { connecting, onward, entersHere, bagsHere, fromHome, toHome };
}

/** Where each leg sits in its itinerary, for every leg of the journal at
 * once — the chains are built a single time, so the surfaces that walk
 * every trip (the hero, the lifecycle reconciler) pay for them once. Legs
 * the journal doesn't hold get a direct flight's place. */
export function legPlaces<T extends Leg>(legs: T[], isHome?: IsHome): (journeyId: string) => LegPlace {
  const byId = new Map<string, LegPlace>();
  for (const chain of chainLegs(legs, instant)) {
    chain.forEach((leg, i) => byId.set(leg.id, placeInChain(chain, i, isHome)));
  }
  return (journeyId) =>
    byId.get(journeyId) ?? { connecting: false, onward: false, entersHere: false, bagsHere: false };
}

/** The stage plan of every leg of the journal, by journey id. */
export function stagePlans<T extends Leg>(legs: T[], isHome?: IsHome): (journeyId: string) => StagePlan {
  const placeOf = legPlaces(legs, isHome);
  const cache = new Map<string, StagePlan>();
  return (journeyId) => {
    let plan = cache.get(journeyId);
    if (!plan) {
      plan = stagePlan(placeOf(journeyId));
      cache.set(journeyId, plan);
    }
    return plan;
  };
}

/** One leg's stage plan, given the journal it sits in. */
export function stagePlanFor<T extends Leg>(leg: Pick<T, 'id'>, legs: T[], isHome?: IsHome): StagePlan {
  return legs.some((l) => l.id === leg.id) ? stagePlans(legs, isHome)(leg.id) : DEFAULT_PLAN;
}

/** The legs of the itinerary a leg belongs to, in flying order — the trip
 * progress screen walks them all. The leg alone when it is not in the
 * journal. */
export function itineraryOf<T extends Leg>(leg: Pick<T, 'id'>, legs: T[]): T[] {
  return chainLegs(legs, instant).find((chain) => chain.some((l) => l.id === leg.id)) ?? legs.filter((l) => l.id === leg.id);
}

/** A plan as the server hands it back: only stages the app knows, in the
 * one order — nothing usable falls back to a direct flight's walk. */
export function planFromSession(plan: readonly string[] | undefined): StagePlan {
  if (!plan) return DEFAULT_PLAN;
  const known = STAGE_ORDER.filter((s) => plan.includes(s));
  return known.length ? known : DEFAULT_PLAN;
}
