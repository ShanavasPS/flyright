import { getAirport } from './airports';
import type { JourneyRow } from './journeys';
import { buildTripGroups, tripGroupDates, tripHeroGroup, tripListSections } from './trip-groups';

const NOW = new Date('2027-05-01T12:00:00Z');
function flight(id: string, from: string, to: string, departure: string, arrival: string, extra: Partial<JourneyRow> = {}): JourneyRow {
  return {
    id, mode: 'flight', fromCode: from, toCode: to,
    fromCountry: getAirport(from)?.country ?? '', toCountry: getAirport(to)?.country ?? '',
    scheduledDeparture: departure, scheduledArrival: arrival,
    bookingReference: null, deletedAt: null, ...extra,
  } as JourneyRow;
}
const out = flight('out', 'HEL', 'JFK', '2027-06-01T14:00', '2027-06-01T15:55');
const back = flight('back', 'BOS', 'HEL', '2027-06-23T18:00', '2027-06-24T08:00');
const canadaOut = flight('canada-out', 'LGA', 'YYZ', '2027-06-10T10:00', '2027-06-10T11:40');
const canadaBack = flight('canada-back', 'YYZ', 'BOS', '2027-06-14T14:00', '2027-06-14T15:40');
const all = [out, canadaOut, canadaBack, back];
const titles = (rows: JourneyRow[]) => buildTripGroups(rows).flatMap(t => t.groups.map(g => g.title));
const flights = (rows: JourneyRow[]) => buildTripGroups(rows).flatMap(t => t.groups.flatMap(g => g.entries.flatMap(e => e.kind === 'flight' ? [e.journey.id] : [])));
const stays = (rows: JourneyRow[]) => buildTripGroups(rows).flatMap(t => t.groups.flatMap(g => g.entries.flatMap(e => e.kind === 'stay' ? [e.stay] : [])));

describe('trip grouping from the current journal', () => {
  it('handles an empty journal and a one-way flight without inventing a stay', () => {
    expect(buildTripGroups([])).toEqual([]);
    expect(tripListSections([], NOW)).toEqual([]);
    expect(titles([out])).toEqual(['New York']);
    expect(stays([out])).toEqual([]);
    expect(tripGroupDates(buildTripGroups([out])[0]!.groups[0]!, 2027)).toBe('1 Jun');
  });

  it('grows a one-way into a return with a local calendar stay, excluding the overnight flight home', () => {
    expect(titles([back, out])).toEqual(['New York']);
    expect(stays([back, out])).toMatchObject([{ days: 22, place: 'the US', fromId: 'out', toId: 'back' }]);
    expect(flights([back, out])).toEqual(['out', 'back']);
    expect(tripGroupDates(buildTripGroups([out, back])[0]!.groups[0]!, 2027)).toBe('1–24 Jun');
  });

  it('shows each visited city when an intermediate international stop is added', () => {
    const trips = buildTripGroups([back, canadaBack, out, canadaOut]);
    expect(trips).toHaveLength(1);
    expect(titles(all)).toEqual(['New York', 'Toronto', 'Boston']);
    expect(trips[0]!.groups.map(g => g.entries.map(e => e.kind === 'flight' ? e.journey.id : `${e.stay.days} days`))).toEqual([
      ['out', '9 days'], ['canada-out', '4 days'], ['canada-back', '9 days', 'back'],
    ]);
    expect(trips[0]!.groups.map(g => tripGroupDates(g, 2027))).toEqual(['1–10 Jun', '10–14 Jun', '14–24 Jun']);
    expect(stays(all).map(s => s.days)).toEqual([9, 4, 9]);
  });

  it('works when the Canada return was saved before the outer US trip', () => {
    expect(titles([canadaBack, canadaOut])).toEqual(['Toronto']);
    expect(titles([canadaBack, canadaOut, back, out])).toEqual(titles(all));
  });

  it('collapses back to the return after deleting the intermediate trip', () => {
    expect(titles([out, back, { ...canadaOut, deletedAt: '2027-05-01' }, { ...canadaBack, deletedAt: '2027-05-01' }])).toEqual(['New York']);
    expect(stays([out, back])[0]!.days).toBe(22);
  });

  it('recalculates date edits and does not retain stale stay lengths', () => {
    const changed = { ...canadaOut, scheduledDeparture: '2027-06-11T10:00', scheduledArrival: '2027-06-11T11:40' };
    expect(stays([out, changed, canadaBack, back]).map(s => s.days)).toEqual([10, 3, 9]);
    expect(stays(all).map(s => s.days)).toEqual([9, 4, 9]);
  });

  it('handles partial intermediate imports without inventing travel across missing legs', () => {
    expect(titles([out, canadaOut, back])).toEqual(['New York', 'Toronto', 'Helsinki']);
    expect(stays([out, canadaOut, back]).map(s => s.days)).toEqual([9]);
    expect(titles(all)).toEqual(['New York', 'Toronto', 'Boston']);
  });

  it('gives an arrival in a different city its own heading even without a flight home yet', () => {
    expect(titles([out, canadaOut, canadaBack])).toEqual(['New York', 'Toronto', 'Boston']);
  });

  it('keeps connecting legs and puts the stay after the last outbound leg', () => {
    const rows = [
      flight('a', 'HEL', 'LHR', '2027-06-01T09:00', '2027-06-01T10:10'),
      flight('b', 'LHR', 'JFK', '2027-06-01T12:10', '2027-06-01T15:00'),
      flight('c', 'JFK', 'LHR', '2027-06-23T18:30', '2027-06-24T06:30'),
      flight('d', 'LHR', 'HEL', '2027-06-24T08:30', '2027-06-24T13:20'),
    ];
    expect(titles(rows)).toEqual(['New York']);
    expect(flights(rows)).toEqual(['a', 'b', 'c', 'd']);
    expect(stays(rows)).toMatchObject([{ days: 22, fromId: 'b', toId: 'c' }]);
    const items = tripListSections(rows, NOW)[0]!.data;
    expect(items.map(i => i.kind)).toEqual(['header', 'flight', 'flight', 'stay', 'flight', 'flight']);
    expect(items.flatMap(i => i.kind === 'flight' && i.connection ? [i.connection.layover] : [])).toEqual(['2h', '2h']);
  });

  it('does not let a different booking split a geographically continuous return', () => {
    expect(titles([{ ...out, bookingReference: 'AAA' }, { ...back, bookingReference: 'BBB' }])).toEqual(['New York']);
  });

  it('does not let a shared booking merge flights from disconnected places', () => {
    const disconnected = flight('other', 'NRT', 'HEL', '2027-06-23T10:00', '2027-06-23T17:00');
    expect(buildTripGroups([{ ...out, bookingReference: 'SAME' }, { ...disconnected, bookingReference: 'SAME' }])).toHaveLength(2);
    expect(stays([out, disconnected])).toEqual([]);
  });

  it('keeps independent trips separate, including repeat visits to the same country', () => {
    const laterOut = { ...out, id: 'later-out', scheduledDeparture: '2027-09-01T14:00', scheduledArrival: '2027-09-01T15:55' };
    const laterBack = { ...back, id: 'later-back', scheduledDeparture: '2027-09-10T18:00', scheduledArrival: '2027-09-11T08:00' };
    expect(buildTripGroups([...all, laterOut, laterBack])).toHaveLength(2);
    expect(titles([...all, laterOut, laterBack])).toEqual(['New York', 'Toronto', 'Boston', 'New York']);
    const items = tripListSections([...all, laterOut, laterBack], NOW)[0]!.data;
    expect(items.filter(i => i.kind === 'separator')).toHaveLength(1);
    expect(tripListSections(all, NOW)[0]!.data.filter(i => i.kind === 'separator')).toHaveLength(0);
  });

  it('uses city destinations for domestic returns', () => {
    const domestic = [flight('a', 'HEL', 'OUL', '2027-06-01T10:00', '2027-06-01T11:00'), flight('b', 'OUL', 'HEL', '2027-06-04T10:00', '2027-06-04T11:00')];
    expect(titles(domestic)).toEqual(['Oulu / Oulunsalo']);
    expect(stays(domestic)).toMatchObject([{ days: 3, place: 'Oulu / Oulunsalo' }]);
  });

  it('shows distinct destination cities for domestic flights within a foreign-country trip', () => {
    const internal = flight('domestic', 'JFK', 'BOS', '2027-06-10T10:00', '2027-06-10T11:00');
    expect(titles([out, internal, back])).toEqual(['New York', 'Boston']);
    expect(buildTripGroups([out, internal, back])).toHaveLength(1);
    expect(buildTripGroups([out, internal, back])[0]!.groups.map(g => [g.country, g.continued])).toEqual([['US', false], ['US', false]]);
    expect(flights([out, internal, back])).toEqual(['out', 'domestic', 'back']);
    expect(stays([out, internal, back]).map(s => s.days)).toEqual([9, 13]);
  });

  it('marks a return to the same city as continued across different airports', () => {
    const returnToNewYork = flight('return-to-new-york', 'YYZ', 'LGA', '2027-06-14T14:00', '2027-06-14T15:40');
    const home = flight('home', 'JFK', 'HEL', '2027-06-23T18:00', '2027-06-24T08:00');
    const rows = [out, canadaOut, returnToNewYork, home];
    expect(titles(rows)).toEqual(['New York', 'Toronto', 'New York continued']);
    expect(buildTripGroups(rows)[0]!.groups[2]).toMatchObject({ country: 'US', continued: true });
    expect(flights(rows)).toEqual(rows.map(r => r.id));
  });

  it('keeps an international return to another home city under the destination heading', () => {
    const home = flight('home', 'BOS', 'OUL', '2027-06-23T18:00', '2027-06-24T08:00');
    expect(titles([out, home])).toEqual(['New York']);
    expect(flights([out, home])).toEqual(['out', 'home']);
    expect(tripGroupDates(buildTripGroups([out, home])[0]!.groups[0]!, 2027)).toBe('1–24 Jun');
  });

  it('flattens repeated intermediate visits without nesting or duplicate flights', () => {
    const mexicoOut = flight('mexico-out', 'YYZ', 'MEX', '2027-06-12T10:00', '2027-06-12T14:00');
    const mexicoBack = flight('mexico-back', 'MEX', 'YYZ', '2027-06-16T10:00', '2027-06-16T14:00');
    const laterCanadaBack = { ...canadaBack, scheduledDeparture: '2027-06-18T14:00', scheduledArrival: '2027-06-18T15:40' };
    const rows = [out, canadaOut, laterCanadaBack, back, mexicoOut, mexicoBack];
    expect(titles(rows)).toEqual(['New York', 'Toronto', 'Mexico City', 'Toronto continued', 'Boston']);
    expect(new Set(flights(rows)).size).toBe(rows.length);
  });

  it('declines an unbounded inferred stay, but honours continuous flights on the same booking', () => {
    const late = { ...back, scheduledDeparture: '2028-06-23T18:00', scheduledArrival: '2028-06-24T08:00' };
    expect(buildTripGroups([out, late])).toHaveLength(2);
    expect(buildTripGroups([{ ...out, bookingReference: 'LONG' }, { ...late, bookingReference: 'long' }])).toHaveLength(1);
  });

  it('counts calendar days across daylight-saving changes rather than 24-hour blocks', () => {
    const rows = [flight('a', 'HEL', 'JFK', '2027-03-13T10:00Z', '2027-03-13T17:00Z'), flight('b', 'LGA', 'HEL', '2027-03-15T16:00Z', '2027-03-16T02:00Z')];
    expect(stays(rows)[0]!.days).toBe(2);
  });

  it('uses airport-local dates for UTC arrivals near midnight', () => {
    const rows = [flight('a', 'HEL', 'JFK', '2027-06-01T16:00Z', '2027-06-02T00:30Z'), flight('b', 'LGA', 'HEL', '2027-06-04T00:30Z', '2027-06-04T08:30Z')];
    expect(stays(rows)[0]!.days).toBe(2);
  });

  it('still chains a hand-typed flight whose arrival was left at its departure time', () => {
    // A manually added flight often carries one placeholder for both times.
    // The airports and the departure order say what follows what, so the trip
    // must stay whole and keep its stays instead of shattering per leg.
    const lax = flight('lax', 'DXB', 'LAX', '2025-09-27T08:55:00', '2025-09-27T14:15:00');
    const sfo = flight('sfo', 'LAX', 'SFO', '2025-10-01T12:00:00', '2025-10-01T12:00:00');
    const las = flight('las', 'SFO', 'LAS', '2025-10-04T12:00:00', '2025-10-04T12:00:00');
    const rows = [lax, sfo, las];
    expect(buildTripGroups(rows)).toHaveLength(1);
    expect(titles(rows)).toEqual(['Los Angeles', 'San Francisco', 'Las Vegas']);
    expect(stays(rows)).toMatchObject([{ days: 4, place: 'the US' }, { days: 3, place: 'the US' }]);
  });

  it('reads a finished trip newest destination first, while a coming one keeps travel order', () => {
    const headers = (rows: JourneyRow[], now: Date) =>
      tripListSections(rows, now).flatMap(s => s.data.flatMap(d => (d.kind === 'header' ? [d.group.title] : [])));
    // Still to fly: the legs come in the order they will be flown.
    expect(headers(all, NOW)).toEqual(['New York', 'Toronto', 'Boston']);
    // Flown: read back like the trips around it, newest destination first.
    expect(headers(all, new Date('2027-08-01T12:00:00Z'))).toEqual(['Boston', 'Toronto', 'New York']);
  });

  it('handles unknown airports, invalid schedules and non-flight modes without dropping records', () => {
    const unknown = flight('unknown', 'ZZZ', 'XXX', '2027-07-01T10:00Z', '2027-07-01T13:00Z');
    const invalid = { ...back, id: 'invalid', scheduledDeparture: 'bad', scheduledArrival: 'bad' };
    const train = { ...out, id: 'train', mode: 'train' as const };
    expect(titles([unknown])).toEqual(['XXX']);
    expect(buildTripGroups([out, train, back, unknown, invalid]).flatMap(t => t.journeys)).toHaveLength(5);
    expect(stays([out, invalid])).toEqual([]);
    expect(() => tripListSections([invalid, unknown, train], NOW)).not.toThrow();
    expect(tripGroupDates(buildTripGroups([invalid])[0]!.groups[0]!, 2027)).toBe('');
  });

  it('does not invent a stay between overlapping flights', () => {
    const overlap = { ...back, scheduledDeparture: '2027-06-01T15:00', scheduledArrival: '2027-06-02T05:00' };
    expect(stays([out, overlap])).toEqual([]);
  });

  it('recognises a direct same-day return as a stay instead of a connection', () => {
    const a = flight('a', 'HEL', 'ARN', '2027-06-01T09:00', '2027-06-01T09:05');
    const b = flight('b', 'ARN', 'HEL', '2027-06-01T18:00', '2027-06-01T20:00');
    expect(titles([a, b])).toEqual(['Stockholm']);
    expect(stays([a, b])).toMatchObject([{ days: 0, place: 'Sweden' }]);
    expect(tripListSections([a, b], NOW)[0]!.data.flatMap(i => i.kind === 'flight' && i.connection ? [i.connection] : [])).toEqual([]);
  });

  it('preserves row identities and every journal field without mutating the input', () => {
    const row = Object.freeze({ ...out, notes: 'Keep me', seat: '32K', privateTrip: true });
    const rows = [back, row];
    const original = JSON.stringify(rows);
    const trips = buildTripGroups(rows);
    expect(JSON.stringify(rows)).toBe(original);
    expect(trips[0]!.journeys[0]).toBe(row);
  });
});

describe('grouped list sections', () => {
  it('keeps an ongoing return together when the outward flight is in the past', () => {
    const sections = tripListSections([out, back], new Date('2027-06-15T12:00:00Z'));
    expect(sections.map(s => s.key)).toEqual(['current']);
    expect(sections[0]!.data.filter(i => i.kind === 'flight').map(i => i.journey.id)).toEqual(['out', 'back']);
    expect(sections[0]!.data.filter(i => i.kind === 'flight').map(i => i.live)).toEqual([false, false]);
  });

  it('files a completed trip across New Year as one trip with explicit dates', () => {
    const a = { ...out, scheduledDeparture: '2026-12-20T14:00', scheduledArrival: '2026-12-20T15:55' };
    const b = { ...back, scheduledDeparture: '2027-01-05T18:00', scheduledArrival: '2027-01-06T08:00' };
    expect(tripListSections([b, a], NOW).map(s => s.key)).toEqual(['2026']);
    expect(tripGroupDates(buildTripGroups([a, b])[0]!.groups[0]!, 2027)).toBe('20 Dec 2026 – 6 Jan 2027');
  });

  it('sorts completed trips newest first, and each finished trip newest destination first', () => {
    const portugal = flight('portugal', 'HEL', 'LIS', '2027-07-01T10:00', '2027-07-01T14:00');
    const sections = tripListSections([...all, portugal], new Date('2027-09-01'));
    // Portugal is the latest trip, then the US/Canada trip read back from its
    // last destination: Boston, Toronto, New York.
    expect(sections[0]!.data.flatMap(i => i.kind === 'flight' ? [i.journey.id] : [])).toEqual([
      'portugal', 'canada-back', 'back', 'canada-out', 'out',
    ]);
  });

  it('keeps the active full row without losing its destination, stays or position', () => {
    const items = tripListSections(all, NOW, out.id)[0]!.data;
    expect(items.flatMap(i => i.kind === 'header' ? [i.group.title] : [])).toEqual(['New York', 'Toronto', 'Boston']);
    expect(items.flatMap(i => i.kind === 'flight' ? [i.journey.id] : [])).toEqual(['out', 'canada-out', 'canada-back', 'back']);
    expect(items.flatMap(i => i.kind === 'flight' && i.hero ? [i.journey.id] : [])).toEqual(['out']);
    expect(items.flatMap(i => i.kind === 'stay' ? [i.stay.days] : [])).toEqual([9, 4, 9]);
    expect(tripListSections([out], NOW, out.id)[0]!.data.filter(i => i.kind === 'flight')).toHaveLength(1);
  });

  it('only gives the active itinerary live styling, not later return flights', () => {
    const items = tripListSections([out, back], new Date('2027-06-01T16:00:00Z'))[0]!.data;
    expect(items.flatMap(i => i.kind === 'flight' ? [i.live] : [])).toEqual([true, false]);
  });

  it('has unique stable keys and no internal separators in any input order', () => {
    const one = tripListSections(all, NOW)[0]!.data;
    const two = tripListSections([...all].reverse(), NOW)[0]!.data;
    expect(one.map(i => i.key)).toEqual(two.map(i => i.key));
    expect(new Set(one.map(i => i.key)).size).toBe(one.length);
    expect(one.some(i => i.kind === 'separator')).toBe(false);
  });

  it('keeps the final flight current through its arrival window, then files the whole trip together', () => {
    const before = new Date('2027-06-23T21:00:00Z');
    const afterScheduledLanding = new Date('2027-06-24T07:00:00Z');
    expect(tripListSections(all, before, back.id)[0]!.title).toBe('Current trip');
    expect(tripListSections(all, afterScheduledLanding, back.id)[0]!.key).toBe('current');
    const complete = tripListSections(all, afterScheduledLanding);
    expect(complete.map(s => s.key)).toEqual(['2027']);
    // Filed as finished, so its destinations read back newest first.
    expect(complete[0]!.data.filter(i => i.kind === 'flight').map(i => i.journey.id)).toEqual([
      'canada-back', 'back', 'canada-out', 'out',
    ]);
    expect(complete[0]!.data.some(i => i.kind === 'flight' && i.hero)).toBe(false);
  });

  it('keeps the London connection before and after a hero handover with stable row keys', () => {
    const a = flight('a', 'HEL', 'LHR', '2027-06-01T09:00', '2027-06-01T10:10');
    const b = flight('b', 'LHR', 'JFK', '2027-06-01T12:10', '2027-06-01T15:00');
    const rows = [a, b, back];
    const first = tripListSections(rows, new Date('2027-06-01T05:00Z'), a.id)[0]!.data;
    const second = tripListSections(rows, new Date('2027-06-01T10:10Z'), b.id)[0]!.data;
    expect(first.map(i => i.key)).toEqual(second.map(i => i.key));
    for (const items of [first, second]) {
      expect(items.find(i => i.kind === 'flight' && i.journey.id === b.id)).toMatchObject({ connection: { prevId: 'a', layover: '2h' } });
      expect(items.filter(i => i.kind === 'flight' && i.hero)).toHaveLength(1);
      expect(items.filter(i => i.kind === 'stay').map(i => i.stay.days)).toEqual([22]);
    }
    expect(second.find(i => i.kind === 'flight' && i.hero)).toMatchObject({ journey: { id: 'b' } });
    expect(tripHeroGroup(rows, NOW, a.id)?.isFirstFlight).toBe(true);
    expect(tripHeroGroup(rows, NOW, b.id)?.isFirstFlight).toBe(false);
  });

  it('keeps a live flight into a new city under that city heading, followed by its stay', () => {
    const items = tripListSections(all, new Date('2027-06-14T17:00Z'), canadaBack.id)[0]!.data;
    const active = items.findIndex(i => i.kind === 'flight' && i.hero);
    expect(items[active - 2]).toMatchObject({ kind: 'stay', stay: { days: 4 } });
    expect(items[active - 1]).toMatchObject({ kind: 'header', group: { title: 'Boston', continued: false } });
    expect(items[active + 1]).toMatchObject({ kind: 'stay', stay: { days: 9 } });
    expect(tripHeroGroup(all, NOW, canadaBack.id)).toMatchObject({ group: { title: 'Boston' }, isFirstFlight: false });
    expect(tripHeroGroup(all, NOW, back.id)).toMatchObject({ group: { title: 'Boston' } });
  });

  it('grows a lone live hero into a return and then a flat multi-destination trip', () => {
    expect(tripListSections([out], NOW, out.id)[0]!.data.filter(i => i.kind === 'flight')).toHaveLength(1);
    expect(tripHeroGroup([out], NOW, out.id)).toMatchObject({ group: { title: 'New York' }, dates: '1 Jun', isFirstFlight: true });
    expect(tripHeroGroup([out, back], NOW, out.id)).toMatchObject({ dates: '1–24 Jun', isFirstFlight: true });
    const added = tripListSections(all, NOW, out.id)[0]!.data;
    expect(added.filter(i => i.kind === 'flight' && i.hero)).toHaveLength(1);
    expect(tripHeroGroup(all, NOW, out.id)?.isFirstFlight).toBe(true);
    expect(tripHeroGroup([back], NOW, back.id)?.isFirstFlight).toBe(true);
    expect(added.filter(i => i.kind === 'header').map(i => i.group.title)).toEqual(['New York', 'Toronto', 'Boston']);
    expect(tripHeroGroup([out], NOW, null)).toBeUndefined();
    expect(tripHeroGroup([{ ...out, deletedAt: '2027-06-01' }], NOW, out.id)).toBeUndefined();
  });

  it('keeps independent future trips separate from a current trip and its hero', () => {
    const portugal = flight('portugal', 'HEL', 'LIS', '2027-07-01T10:00', '2027-07-01T14:00');
    const sections = tripListSections([...all, portugal], new Date('2027-06-14T17:00Z'), canadaBack.id);
    expect(sections.map(s => s.key)).toEqual(['current', 'upcoming']);
    expect(sections[1]!.data.find(i => i.kind === 'flight')).toMatchObject({ journey: { id: 'portugal' }, hero: false });
  });

  it('enters and leaves current-trip sections when only the clock changes', () => {
    const rows = [out, back];
    expect(tripListSections(rows, new Date('2027-05-28T12:00Z'))[0]!.key).toBe('upcoming');
    expect(tripListSections(rows, new Date('2027-06-02T12:00Z'))[0]!.key).toBe('current');
    expect(tripListSections(rows, new Date('2027-06-25T12:00Z'))[0]!.key).toBe('2027');
  });
});
