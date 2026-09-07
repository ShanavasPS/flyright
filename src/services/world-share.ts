import { useSyncExternalStore } from 'react';

import type { JourneyRow } from '@/services/journeys';
import { cityOf, formatKm, travelRecap, type TravelRecap } from '@/services/timeline';
import { journeyDay, periodLabel, yearsWithFlights, type WorldPeriod } from '@/services/world-period';

/** What the World tab hands the share screen: the rows on the map right now
 * and how they got there. `route` is a tapped route (one pair of airports,
 * one or many legs); `period` is the filtered map. */
export interface WorldShare {
  rows: JourneyRow[];
  period: WorldPeriod;
  kind: 'period' | 'route';
}

/** Module store, same reasoning as world-focus: the share screen is a root
 * modal and the rows are already in hand, so a store beats re-querying and
 * re-filtering from route params. */
let current: WorldShare | null = null;
const listeners = new Set<() => void>();

export function openWorldShare(share: WorldShare | null) {
  current = share;
  for (const listener of listeners) listener();
}

export function useWorldShare(): WorldShare | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current,
  );
}

export type ShareFormat = 'story' | 'square';

export interface ShareDetail {
  label: string;
  value: string;
}

/** Everything the card prints, decided once from the rows. */
export interface ShareCopy {
  /** Small caps above the title: "WHERE SAM FLEW", "SAM IS FLYING". */
  eyebrow: string;
  /** The big line: "2025", "September 2025", "HEL → LHR", "2019 – 2026". */
  title: string;
  /** One quieter line under it, or null. */
  subtitle: string | null;
  /** The numbers row. */
  stats: { value: string; label: string }[];
  /** Records under the numbers — top city, longest leg, most flown airline. */
  details: ShareDetail[];
  /** True for one flight on its own; the card fits the map tighter. */
  single: boolean;
}

/** Distance for a quarter-width tile: "1,830", "22.3k", "102k". The stats
 * card's `formatKm` keeps five digits, which overflow at poster size. */
function compactKm(km: number): string {
  if (km >= 100_000) return formatKm(km);
  if (km >= 10_000) return `${(km / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return km.toLocaleString();
}

const HOURS_LABEL = (hours: number) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
};

/** "AY1331 · Finnair" style naming without the logo component: the carrier
 * unless it is only the flight number's own code, then the number alone. */
function legName(row: JourneyRow): string | null {
  const carrier = row.carrier.trim();
  const placeholder = carrier.toLowerCase() === row.mode;
  const number = row.number?.trim();
  if (number && carrier && !placeholder && carrier.toUpperCase() !== number.slice(0, 2)) {
    return `${carrier} ${number}`;
  }
  return number || (placeholder ? null : carrier) || null;
}

function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
  return date.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** The words on the card. `name` is the traveller's first name when the app
 * knows it; without one the copy speaks in the first person. `now` decides
 * flew vs is flying. */
export function shareCopy(share: WorldShare, name: string | null, now: Date): ShareCopy {
  const { rows, period, kind } = share;
  const who = name?.trim() || null;
  const recap: TravelRecap = travelRecap(rows);
  const allUpcoming = rows.length > 0 && rows.every((r) => new Date(r.scheduledDeparture) > now);
  const flew = allUpcoming ? (who ? `${who} is flying` : 'I’m flying') : who ? `${who} flew` : 'I flew';

  if (kind === 'route' && rows.length === 1) {
    const row = rows[0];
    const parts = [legName(row), dayLabel(journeyDay(row))].filter(Boolean) as string[];
    return {
      eyebrow: flew.toUpperCase(),
      title: `${row.fromCode} → ${row.toCode}`,
      subtitle: `${cityOf(row.fromCode)} to ${cityOf(row.toCode)} · ${parts.join(' · ')}`,
      stats: [
        { value: row.distanceKm.toLocaleString(), label: 'km' },
        { value: HOURS_LABEL(recap.hoursAloft), label: recap.hoursEstimated ? '≈ in the air' : 'in the air' },
        { value: `${recap.countries}`, label: recap.countries === 1 ? 'country' : 'countries' },
      ],
      details: [],
      single: true,
    };
  }

  const stats = [
    { value: recap.trips.toLocaleString(), label: recap.trips === 1 ? 'flight' : 'flights' },
    { value: recap.airports.toLocaleString(), label: recap.airports === 1 ? 'airport' : 'airports' },
    { value: recap.countries.toLocaleString(), label: recap.countries === 1 ? 'country' : 'countries' },
    { value: compactKm(recap.totalKm), label: 'km' },
  ];

  const details: ShareDetail[] = [];
  if (rows.length > 1) {
    if (recap.topDestination) details.push({ label: 'Most visited', value: recap.topDestination.city });
    if (recap.longest) {
      details.push({
        label: 'Longest flight',
        value: `${recap.longest.fromCode} → ${recap.longest.toCode} · ${recap.longest.distanceKm.toLocaleString()} km`,
      });
    }
    if (recap.topAirline && recap.airlines > 0) {
      details.push({ label: 'Most flown', value: recap.topAirline.carrier });
    }
  }

  if (kind === 'route') {
    const [a, b] = [rows[0].fromCode, rows[0].toCode];
    const name0 = legName(rows[0]);
    return {
      eyebrow: `WHERE ${flew.toUpperCase()}`,
      title: `${a} → ${b}`,
      subtitle: `${cityOf(a)} and ${cityOf(b)} · ${rows.length} flights${name0 && recap.airlines === 1 ? ` · ${rows[0].carrier}` : ''}`,
      stats,
      details,
      single: false,
    };
  }

  switch (period.kind) {
    case 'all': {
      const years = yearsWithFlights(rows);
      const span =
        years.length === 0
          ? ''
          : years.length === 1
            ? `${years[0]}`
            : `${years[years.length - 1]} – ${years[0]}`;
      return {
        eyebrow: who ? `EVERYWHERE ${who.toUpperCase()} HAS FLOWN` : 'EVERYWHERE I’VE FLOWN',
        title: span || 'My world',
        subtitle: null,
        stats,
        details,
        single: false,
      };
    }
    case 'year':
    case 'month':
    case 'range':
      return {
        eyebrow: `WHERE ${flew.toUpperCase()}`,
        title: periodLabel(period, true),
        subtitle: null,
        stats,
        details,
        single: false,
      };
  }
}
