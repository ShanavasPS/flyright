import { getAirport } from './airports';
import type { JourneyRow } from './journeys';
import { tripDestination } from './destination';
import { connectionsInto } from './connections';
import { buildTripGroups, orderTripGroups, tripGroupDates, tripGroupRows, tripHeroGroup, tripListSections } from './trip-groups';

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

  it('marks a return to the same city as a repeat visit across different airports', () => {
    const returnToNewYork = flight('return-to-new-york', 'YYZ', 'LGA', '2027-06-14T14:00', '2027-06-14T15:40');
    const home = flight('home', 'JFK', 'HEL', '2027-06-23T18:00', '2027-06-24T08:00');
    const rows = [out, canadaOut, returnToNewYork, home];
    expect(titles(rows)).toEqual(['New York', 'Toronto', 'New York']);
    expect(buildTripGroups(rows)[0]!.groups[2]).toMatchObject({ country: 'US', continued: true });
    expect(flights(rows)).toEqual(rows.map(r => r.id));
  });

  it('names, flags and photographs a visit by its destination, never its layover', () => {
    // Production 1.1.5: a Helsinki trip via Doha read as Qatar, Portland via
    // Amsterdam as the Netherlands — the header took the first leg's arrival.
    const toDoha = flight('to-doha', 'MNL', 'DOH', '2027-06-01T08:00', '2027-06-01T12:00');
    const toHelsinki = flight('to-helsinki', 'DOH', 'HEL', '2027-06-01T14:00', '2027-06-01T19:30');
    const toAmsterdam = flight('to-amsterdam', 'HEL', 'AMS', '2027-07-01T08:00', '2027-07-01T09:40');
    const toPortland = flight('to-portland', 'AMS', 'PDX', '2027-07-01T12:00', '2027-07-01T13:30');
    const places = (rows: JourneyRow[]) => buildTripGroups(rows).flatMap(t => t.groups.map(g => [g.title, tripDestination(g).place]));
    expect(places([toDoha, toHelsinki])).toEqual([['Helsinki', { city: 'Helsinki', country: 'FI' }]]);
    expect(places([toAmsterdam, toPortland])).toEqual([['Portland', { city: 'Portland', country: 'US' }]]);
    expect(tripDestination(buildTripGroups([toAmsterdam, toPortland])[0]!.groups[0]!).from).toEqual({ city: 'Helsinki', country: 'FI' });
  });

  it('places a resumed visit at its own city, not the next stop', () => {
    const returnToNewYork = flight('return-to-new-york', 'YYZ', 'LGA', '2027-06-14T14:00', '2027-06-14T15:40');
    const home = flight('home', 'JFK', 'HEL', '2027-06-23T18:00', '2027-06-24T08:00');
    const groups = buildTripGroups([out, canadaOut, returnToNewYork, home])[0]!.groups;
    expect(groups.map(g => [g.title, tripDestination(g).place.city])).toEqual([['New York', 'New York'], ['Toronto', 'Toronto'], ['New York', 'New York']]);
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
    expect(titles(rows)).toEqual(['New York', 'Toronto', 'Mexico City', 'Toronto', 'Boston']);
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
    expect(stays(rows)).toMatchObject([{ days: 4, place: 'Los Angeles' }, { days: 3, place: 'San Francisco' }]);
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
    expect(stays([a, b])).toMatchObject([{ days: 0, place: 'Stockholm' }]);
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

  it('sorts completed trips newest first, and each finished trip newest leg first', () => {
    const portugal = flight('portugal', 'HEL', 'LIS', '2027-07-01T10:00', '2027-07-01T14:00');
    const sections = tripListSections([...all, portugal], new Date('2027-09-01'));
    // Portugal is the latest trip, then the US/Canada trip read back from the
    // flight home: Boston, Toronto, New York.
    expect(sections[0]!.data.flatMap(i => i.kind === 'flight' ? [i.journey.id] : [])).toEqual([
      'portugal', 'back', 'canada-back', 'canada-out', 'out',
    ]);
  });

  it('sorts completed trips by when they got home, not when they left', () => {
    // Sydney leaves first but lands last, so it is the newest finished trip.
    const sydney = flight('sydney', 'HEL', 'SYD', '2027-07-01T10:00Z', '2027-07-02T20:00Z');
    const copenhagen = flight('copenhagen', 'ARN', 'CPH', '2027-07-01T12:00Z', '2027-07-01T13:10Z');
    const ids = tripListSections([copenhagen, sydney], new Date('2027-09-01'))[0]!.data.flatMap(i => i.kind === 'flight' ? [i.journey.id] : []);
    expect(ids).toEqual(['sydney', 'copenhagen']);
  });

  it('orders Upcoming by when each trip was saved when asked, newest save first', () => {
    const soon = flight('soon', 'HEL', 'ARN', '2027-06-01T09:00Z', '2027-06-01T09:05Z', { createdAt: '2027-03-01T10:00:00Z' });
    const soonBack = flight('soon-back', 'ARN', 'HEL', '2027-06-03T18:00Z', '2027-06-03T20:00Z', { createdAt: '2027-03-01T10:00:00Z' });
    const later = flight('later', 'HEL', 'CDG', '2027-08-01T09:00Z', '2027-08-01T11:00Z', { createdAt: '2027-04-20T10:00:00Z' });
    const ids = (sort: Parameters<typeof tripListSections>[4]) =>
      tripListSections([soon, soonBack, later], NOW, null, undefined, sort)[0]!.data.flatMap(i => i.kind === 'flight' ? [i.journey.id] : []);
    expect(ids({ upcoming: 'next', past: 'latest' })).toEqual(['soon', 'soon-back', 'later']);
    // The Paris trip was saved last, so it leads; each trip keeps flying order.
    expect(ids({ upcoming: 'added', past: 'latest' })).toEqual(['later', 'soon', 'soon-back']);
  });

  it('turns the whole past around when sorted oldest first, years and legs included', () => {
    const old = flight('old', 'HEL', 'LIS', '2026-03-01T10:00Z', '2026-03-01T14:00Z');
    const oldBack = flight('old-back', 'LIS', 'HEL', '2026-03-08T10:00Z', '2026-03-08T16:00Z');
    const rows = [old, oldBack, ...all];
    const later = new Date('2027-09-01T00:00Z');
    const read = (past: 'latest' | 'oldest') => tripListSections(rows, later, null, undefined, { upcoming: 'next', past })
      .map(s => `${s.key}: ${s.data.flatMap(i => i.kind === 'flight' ? [i.journey.id] : []).join(' ')}`);
    expect(read('latest')).toEqual(['2027: back canada-back canada-out out', '2026: old-back old']);
    expect(read('oldest')).toEqual(['2026: old old-back', '2027: out canada-out canada-back back']);
  });

  it('keeps each connection between its two legs when a finished trip reads back', () => {
    const a = flight('a', 'HEL', 'DOH', '2027-05-11T15:20Z', '2027-05-11T21:20Z');
    const b = flight('b', 'DOH', 'SIN', '2027-05-11T23:10Z', '2027-05-12T06:50Z');
    const c = flight('c', 'SIN', 'DOH', '2027-05-18T11:25Z', '2027-05-18T19:20Z');
    const d = flight('d', 'DOH', 'HEL', '2027-05-18T22:20Z', '2027-05-19T04:05Z');
    const rows = [a, b, c, d];
    const shape = (now: Date) => tripListSections(rows, now)[0]!.data.flatMap(i =>
      i.kind === 'flight' ? [i.connection ? `~${i.journey.id}` : i.journey.id] : i.kind === 'stay' ? ['stay'] : []);
    // Coming: the joint sits above the leg it leads into.
    expect(shape(new Date('2027-05-01T00:00Z'))).toEqual(['a', '~b', 'stay', 'c', '~d']);
    // Flown: the flight home on top, and the joint above the leg it leads out of.
    expect(shape(new Date('2027-09-01T00:00Z'))).toEqual(['d', '~c', 'stay', 'b', '~a']);
  });

  it('shows only the destination being travelled as the current trip; the rest waits under Upcoming', () => {
    const sections = tripListSections(all, NOW, out.id);
    expect(sections.map(s => s.key)).toEqual(['current', 'upcoming']);
    const [current, upcoming] = sections.map(s => s.data);
    expect(current!.flatMap(i => i.kind === 'header' ? [i.group.title] : [])).toEqual(['New York']);
    expect(current!.flatMap(i => i.kind === 'flight' ? [i.journey.id] : [])).toEqual(['out']);
    expect(current!.flatMap(i => i.kind === 'flight' && i.hero ? [i.journey.id] : [])).toEqual(['out']);
    expect(current!.flatMap(i => i.kind === 'stay' ? [i.stay.days] : [])).toEqual([9]);
    expect(upcoming!.flatMap(i => i.kind === 'header' ? [i.group.title] : [])).toEqual(['Toronto', 'Boston']);
    expect(upcoming!.flatMap(i => i.kind === 'flight' ? [i.journey.id] : [])).toEqual(['canada-out', 'canada-back', 'back']);
    expect(upcoming!.flatMap(i => i.kind === 'stay' ? [i.stay.days] : [])).toEqual([4, 9]);
    expect(tripListSections([out], NOW, out.id)[0]!.data.filter(i => i.kind === 'flight')).toHaveLength(1);
  });

  it('files a destination with the past once all its flights have landed', () => {
    // In New York between flights: its one flight has landed, so New York is
    // past; Toronto, whose flight is next, is the current trip.
    const sections = tripListSections(all, new Date('2027-06-05T12:00Z'));
    expect(sections.map(s => `${s.key}: ${s.data.flatMap(i => i.kind === 'header' ? [i.group.title] : []).join(', ')}`))
      .toEqual(['current: Toronto', 'upcoming: Boston', '2027: New York']);
  });

  it('never shows more than one destination as the current trip', () => {
    const lisbon = flight('lisbon', 'HEL', 'LIS', '2027-05-20T10:00Z', '2027-05-20T14:00Z');
    const lisbonBack = flight('lisbon-back', 'LIS', 'HEL', '2027-05-29T10:00Z', '2027-05-29T16:00Z');
    const portugal = flight('portugal', 'HEL', 'OPO', '2027-07-01T10:00Z', '2027-07-01T14:00Z');
    const rows = [lisbon, lisbonBack, ...all, portugal];
    // Every six hours from before the first take-off to after the last landing.
    for (let t = Date.parse('2027-05-19T00:00Z'); t < Date.parse('2027-07-03T00:00Z'); t += 6 * 3_600_000) {
      const current = tripListSections(rows, new Date(t)).filter(s => s.key === 'current');
      expect(current.length).toBeLessThanOrEqual(1);
      expect(current.flatMap(s => s.data.filter(i => i.kind === 'header')).length).toBeLessThanOrEqual(1);
    }
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
    // Filed as finished, so it reads back newest first, the flight home on top.
    expect(complete[0]!.data.filter(i => i.kind === 'flight').map(i => i.journey.id)).toEqual([
      'back', 'canada-back', 'canada-out', 'out',
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
    const sections = tripListSections(all, new Date('2027-06-14T17:00Z'), canadaBack.id);
    const items = sections[0]!.data;
    const active = items.findIndex(i => i.kind === 'flight' && i.hero);
    expect(items[active - 1]).toMatchObject({ kind: 'header', group: { title: 'Boston', continued: false } });
    // Toronto, with its stay, is behind the traveller now and filed as past.
    expect(sections.find(s => s.key === '2027')!.data.find(i => i.kind === 'stay')).toMatchObject({ stay: { days: 4 } });
    expect(items[active + 1]).toMatchObject({ kind: 'stay', stay: { days: 9 } });
    expect(tripHeroGroup(all, NOW, canadaBack.id)).toMatchObject({ group: { title: 'Boston' }, isFirstFlight: false });
    expect(tripHeroGroup(all, NOW, back.id)).toMatchObject({ group: { title: 'Boston' } });
  });

  it('grows a lone live hero into a return and then a flat multi-destination trip', () => {
    expect(tripListSections([out], NOW, out.id)[0]!.data.filter(i => i.kind === 'flight')).toHaveLength(1);
    expect(tripHeroGroup([out], NOW, out.id)).toMatchObject({ group: { title: 'New York' }, dates: '1 Jun', isFirstFlight: true });
    expect(tripHeroGroup([out, back], NOW, out.id)).toMatchObject({ dates: '1–24 Jun', isFirstFlight: true });
    const added = tripListSections(all, NOW, out.id).flatMap(s => s.data);
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
    // Boston is under way; New York and Toronto are flown, Portugal is ahead.
    expect(sections.map(s => s.key)).toEqual(['current', 'upcoming', '2027']);
    expect(sections[1]!.data.find(i => i.kind === 'flight')).toMatchObject({ journey: { id: 'portugal' }, hero: false });
  });

  it('enters and leaves current-trip sections when only the clock changes', () => {
    const rows = [out, back];
    expect(tripListSections(rows, new Date('2027-05-28T12:00Z'))[0]!.key).toBe('upcoming');
    expect(tripListSections(rows, new Date('2027-06-02T12:00Z'))[0]!.key).toBe('current');
    expect(tripListSections(rows, new Date('2027-06-25T12:00Z'))[0]!.key).toBe('2027');
  });
});

describe('destination pages draw trips as Flights does', () => {
  const a = flight('a', 'HEL', 'DOH', '2027-05-11T15:20Z', '2027-05-11T21:20Z');
  const b = flight('b', 'DOH', 'SIN', '2027-05-11T23:10Z', '2027-05-12T06:50Z');
  const c = flight('c', 'SIN', 'DOH', '2027-05-18T11:25Z', '2027-05-18T19:20Z');
  const d = flight('d', 'DOH', 'HEL', '2027-05-18T22:20Z', '2027-05-19T04:05Z');
  const shape = (readBack: boolean) => {
    const rows = [a, b, c, d];
    const connections = connectionsInto(rows);
    return buildTripGroups(rows).flatMap(t => t.groups).flatMap(g => tripGroupRows(g, connections, readBack)).map(r =>
      r.kind === 'flight' ? (r.connection ? `~${r.journey.id}` : r.journey.id) : 'stay');
  };

  it('keeps the connections and stays of a trip, in travel order or read back', () => {
    expect(shape(false)).toEqual(['a', '~b', 'stay', 'c', '~d']);
    expect(shape(true)).toEqual(['d', '~c', 'stay', 'b', '~a']);
  });

  it('puts trips still to come first and the finished ones after, as the sort chips say', () => {
    const groups = buildTripGroups([out, back, flight('old', 'HEL', 'JFK', '2026-03-01T10:00', '2026-03-01T13:00'),
      flight('old-back', 'JFK', 'HEL', '2026-03-09T18:00', '2026-03-10T08:00'),
      flight('older', 'HEL', 'JFK', '2025-03-01T10:00', '2025-03-01T13:00', { createdAt: '2027-04-30T10:00:00Z' } as Partial<JourneyRow>)])
      .flatMap(t => t.groups);
    const ids = (list: typeof groups) => list.map(g => g.entries.find(e => e.kind === 'flight')!.key);
    const order = orderTripGroups(groups, NOW);
    expect(ids(order.upcoming)).toEqual(['flight:out']);
    expect(ids(order.past)).toEqual(['flight:old', 'flight:older']);
    expect(order.readBack).toBe(true);
    const oldest = orderTripGroups(groups, NOW, { upcoming: 'next', past: 'oldest' });
    expect(ids(oldest.past)).toEqual(['flight:older', 'flight:old']);
    expect(oldest.readBack).toBe(false);
  });
});
