/** Runs the app's own trip grouping, trip headers and home base over a real
 * journal pulled read-only from production (`npm run release:journal`), so a
 * place or grouping bug shows up before a build instead of on a phone.
 * Skipped unless FLYRIGHT_JOURNAL points at the pulled file. */
import { readFileSync } from 'fs';

import { tripDestination } from '@/services/destination';
import { currentHome, doorToDoor, EMPTY_HOME_BASE } from '@/services/home-base';
import type { JourneyRow } from '@/services/journeys';
import { buildTripGroups } from '@/services/trip-groups';

const file = process.env.FLYRIGHT_JOURNAL;
const run = file ? describe : describe.skip;

interface Pulled { user: string; rows: { key: string; flight: string; from: string; to: string; dep: string; arr: string; booking: string | null }[] }

function journal(person: Pulled): JourneyRow[] {
  return person.rows.map((r, i) => ({
    id: r.key || String(i), mode: 'flight', number: r.flight,
    fromCode: r.from.split('/')[0], fromCountry: r.from.split('/')[1] ?? '',
    toCode: r.to.split('/')[0], toCountry: r.to.split('/')[1] ?? '',
    scheduledDeparture: r.dep, scheduledArrival: r.arr, bookingReference: r.booking, deletedAt: null,
  }) as JourneyRow);
}

run('production journal', () => {
  const people: Pulled[] = file ? JSON.parse(readFileSync(file, 'utf8')).filter((p: Pulled) => p.rows.length) : [];

  it.each(people.map((p) => [p.user.slice(0, 12), p] as const))('%s: every trip header is its own city, the home is a city journeys leave from', (_, person) => {
    const rows = journal(person);
    const headers = buildTripGroups(rows).flatMap((t) => t.groups.map((g) => ({ title: g.title, place: tripDestination(g).place.city })));
    const home = currentHome(EMPTY_HOME_BASE, rows, new Date().toISOString().slice(0, 10));
    const starts = new Set(doorToDoor(rows).map((r) => r.fromCode));
    console.log([...headers.map((h) => `${h.title} -> ${h.place}`), `home: ${home?.city} (${home?.departures} of ${home?.total})`].join('\n'));
    expect(headers.filter((h) => !h.title.startsWith('Moved to') && h.title !== h.place)).toEqual([]);
    if (home) expect([...starts].some((code) => rows.some((r) => r.fromCode === code && r.fromCountry === home.country))).toBe(true);
  });
});
