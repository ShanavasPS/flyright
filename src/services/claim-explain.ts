/**
 * What a wide window's Claims tab says beside a claim and under the list
 * (docs/wide-layouts-plan.md §6): why the claim is worth what it is, and what
 * the traveller's recent flights came to. Pure — built only from what the
 * app actually holds: a trip's distance and countries, and the arrival delay
 * the disruptions table recorded when a status lookup saw it. A fact the app
 * does not have is said to be unknown, never guessed.
 */
import { evaluate } from '@/rules/engine';
import { isEUTerritory, isIntraEU, isUK } from '@/rules/regions';
import type { Journey } from '@/rules/types';

export interface WhyRow {
  label: string;
  value: string;
  why: string;
}

const km = (n: number) => `${Math.round(n).toLocaleString('en-US')} km`;

export function lateLabel(minutes: number): string {
  if (minutes < 15) return 'On time';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''} late` : `${m} min late`;
}

/**
 * The facts behind a claim's amount, as label / value / reason rows:
 * the distance and its band, the recorded arrival delay (or that none was
 * recorded), and why the regulation covers the route. Mirrors rules/eu261 and
 * rules/uk261; returns [] for anything else (rail, unknown regulations).
 */
export function explainAmount(input: {
  regulation: string;
  distanceKm: number;
  fromCountry: string;
  toCountry: string;
  carrierCountry: string;
  delayMinutes: number | null;
}): WhyRow[] {
  const { regulation, distanceKm, fromCountry, toCountry, delayMinutes } = input;
  if (regulation !== 'EU261' && regulation !== 'UK261') return [];
  const uk = regulation === 'UK261';
  const money = (eur: number) =>
    uk ? `£${({ 250: 220, 300: 260, 400: 350, 600: 520 } as Record<number, number>)[eur]}` : `€${eur}`;
  const internal = uk ? isUK(fromCountry) && isUK(toCountry) : isIntraEU(fromCountry, toCountry);
  const longHaul = distanceKm > 3500 && !internal;

  const band =
    distanceKm <= 1500
      ? `Up to 1,500 km: ${money(250)}`
      : internal && distanceKm > 3500
        ? `${uk ? 'Within the UK' : 'Within the EU'}, over 1,500 km: capped at ${money(400)}`
        : distanceKm <= 3500
          ? `1,500–3,500 km: ${money(400)}`
          : `Over 3,500 km: ${money(600)}`;

  const rows: WhyRow[] = [{ label: 'Distance', value: km(distanceKm), why: band }];

  if (delayMinutes == null) {
    rows.push({ label: 'Arrival', value: 'Delay not recorded', why: 'Open the trip to check it' });
  } else {
    rows.push({
      label: 'Arrival',
      value: lateLabel(delayMinutes),
      why:
        delayMinutes < 180
          ? 'Under 3 h: no compensation'
          : longHaul && delayMinutes < 240
            ? `Under 4 h on a long flight: halved to ${money(300)}`
            : 'Over 3 h: compensation due',
    });
  }

  const home = uk ? isUK : isEUTerritory;
  rows.push({
    label: 'Covered by',
    value: regulation,
    why: home(fromCountry)
      ? `Leaves ${uk ? 'the UK' : 'the EU'}`
      : `Arrives in ${uk ? 'the UK' : 'the EU'} on ${uk ? 'a UK' : 'an EU'} airline`,
  });
  return rows;
}

export interface RecentFlight {
  id: string;
  title: string;
  route: string;
  /** "On time", "38 min late", "Not checked". */
  status: string;
  /** Set when the recorded delay is owed money under the rules. */
  owed: string | null;
  /** The flight already has a claim (it is in the list above). */
  claimed: boolean;
}

/** The latest flown flights with what the app knows about their arrival:
 * the recorded delay and, when it is owed money, how much. Flights the app
 * never saw land read "Not checked" — not "On time". */
export function recentFlights(
  rows: { id: string; journey: Journey; scheduledArrival: string; delayMinutes: number | null }[],
  claimedJourneyIds: ReadonlySet<string>,
  now: number,
  limit = 4,
): RecentFlight[] {
  return rows
    .filter((r) => r.journey.mode === 'flight' && Date.parse(r.scheduledArrival) < now)
    .sort((a, b) => Date.parse(b.scheduledArrival) - Date.parse(a.scheduledArrival))
    .slice(0, limit)
    .map((r) => {
      const verdict =
        r.delayMinutes == null ? null : evaluate(r.journey, { type: 'delay', delayMinutes: r.delayMinutes });
      const owed =
        verdict?.eligible && verdict.compensation
          ? `${verdict.compensation.currency === 'GBP' ? '£' : '€'}${verdict.compensation.amount} owed`
          : null;
      return {
        id: r.id,
        title: `${r.journey.carrier}${r.journey.number ? ` ${r.journey.number}` : ''}`,
        route: `${r.journey.from.code} → ${r.journey.to.code}`,
        status: r.delayMinutes == null ? 'Not checked' : lateLabel(r.delayMinutes),
        owed,
        claimed: claimedJourneyIds.has(r.id),
      };
    });
}
