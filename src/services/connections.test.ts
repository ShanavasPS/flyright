import { chainLegs, layoverLabel, layoverMs, onwardFrom } from '../../convex/itineraryShared';

import {
  connectionBetween,
  connectionsInto,
  legInstant,
  onwardLine,
  scheduledProgress,
  splitByItinerary,
  viaStops,
} from './connections';

// Shanavas's receipt: COK→DOH typed by hand (bare clocks), DOH→HEL from the
// lookup (instants). Only airport-zone pinning makes the two comparable.
const qr517 = { id: 'a', fromCode: 'COK', toCode: 'DOH', scheduledDeparture: '2026-09-09T04:15:00', scheduledArrival: '2026-09-09T06:05:00' };
const qr301 = { id: 'b', fromCode: 'DOH', toCode: 'HEL', scheduledDeparture: '2026-09-09T06:00:00.000Z', scheduledArrival: '2026-09-09T12:30:00.000Z' };
const qr304 = { id: 'c', fromCode: 'HEL', toCode: 'DOH', scheduledDeparture: '2026-09-19T09:50:00', scheduledArrival: '2026-09-19T16:25:00' };
const qr516 = { id: 'd', fromCode: 'DOH', toCode: 'COK', scheduledDeparture: '2026-09-19T16:40:00.000Z', scheduledArrival: '2026-09-19T21:15:00.000Z' };

describe('layoverMs', () => {
  it('pins a bare wall clock to its airport before comparing', () => {
    // 06:05 at DOH (UTC+3) is 03:05Z; QR301 leaves 06:00Z → 2h 55m.
    expect(layoverMs(qr517, qr301, legInstant)).toBe(175 * 60_000);
  });
  it('rejects a different airport, a departure before landing, and more than a day', () => {
    expect(layoverMs(qr301, qr304, legInstant)).toBeNull(); // HEL→…, ten days later
    expect(layoverMs(qr301, qr517, legInstant)).toBeNull(); // wrong airport
    expect(
      layoverMs(qr517, { ...qr301, scheduledDeparture: '2026-09-10T06:00:00.000Z' }, legInstant),
    ).toBeNull();
  });
});

describe('chainLegs / onwardFrom', () => {
  it('groups the receipt into two itineraries', () => {
    const chains = chainLegs([qr516, qr301, qr304, qr517], legInstant);
    expect(chains.map((c) => c.map((l) => l.id))).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('lists the legs after a given one', () => {
    expect(onwardFrom(qr517, [qr516, qr301, qr304], legInstant).map((l) => l.id)).toEqual(['b']);
    expect(onwardFrom(qr301, [qr516, qr304], legInstant)).toEqual([]);
  });
});

describe('connectionsInto / connectionBetween', () => {
  const connections = connectionsInto([qr517, qr301, qr304, qr516]);
  it('describes the joint that leads into a continuing leg', () => {
    expect(connections.get('b')).toEqual({ prevId: 'a', viaCode: 'DOH', layover: '2h 55m' });
    expect(connections.get('d')).toEqual({ prevId: 'c', viaCode: 'DOH', layover: '3h 15m' });
    expect(connections.has('a')).toBe(false);
  });
  it('finds the joint between neighbours in either list order', () => {
    expect(connectionBetween(connections, qr517, qr301)?.layover).toBe('2h 55m');
    expect(connectionBetween(connections, qr301, qr517)?.layover).toBe('2h 55m');
    expect(connectionBetween(connections, qr301, qr304)).toBeNull();
    expect(connectionBetween(connections, undefined, qr301)).toBeNull();
  });
});

describe('splitByItinerary', () => {
  it('keeps a journey ahead until its last leg departs, then files it whole', () => {
    const between = new Date('2026-09-09T04:00:00Z'); // QR517 landed, QR301 not yet gone
    expect(splitByItinerary([qr301, qr517, qr304, qr516], between)).toEqual({
      upcoming: [qr517, qr301, qr304, qr516],
      past: [],
    });
    const later = new Date('2026-09-10T00:00:00Z');
    expect(splitByItinerary([qr301, qr517, qr304, qr516], later)).toEqual({
      upcoming: [qr304, qr516],
      past: [qr517, qr301],
    });
  });
});

describe('scheduledProgress', () => {
  it('waits at the origin, rides the line, then sits at the destination', () => {
    expect(scheduledProgress(qr301, new Date('2026-09-09T05:00:00Z'))).toBe(0);
    expect(scheduledProgress(qr301, new Date('2026-09-09T09:15:00Z'))).toBe(0.5);
    expect(scheduledProgress(qr301, new Date('2026-09-09T06:01:00Z'))).toBe(0.03);
    expect(scheduledProgress(qr301, new Date('2026-09-09T13:00:00Z'))).toBe(1);
  });
});

describe('viaStops', () => {
  it('folds an itinerary into stops with layovers and the final arrival', () => {
    expect(viaStops(qr517, [qr301])).toEqual({
      stops: [{ code: 'DOH', layover: '2h 55m' }],
      toCode: 'HEL',
      arrival: qr301.scheduledArrival,
    });
    expect(viaStops(qr517, [])).toEqual({ stops: [], toCode: 'DOH', arrival: qr517.scheduledArrival });
  });
});

describe('onwardLine', () => {
  const session = {
    toCode: 'DOH',
    scheduledDeparture: '2026-09-08T22:45:00Z',
    scheduledArrival: '2026-09-09T03:05:00Z',
    estimatedDeparture: null,
    actualDeparture: null,
    estimatedArrival: '2026-09-09T03:35:00Z',
    actualArrival: null,
  };
  it('counts the connection from the arrival the airline now says', () => {
    const before = new Date('2026-09-09T03:40:00Z');
    const line = onwardLine(session, [{ ...qr301, number: 'QR301', carrier: 'Qatar Airways' }], before);
    expect(line).toMatch(/^2h 25m in Doha · then QR301 to HEL /);
  });
  it('is silent on the last leg, and once the connection has already left', () => {
    const before = new Date('2026-09-09T03:40:00Z');
    expect(onwardLine(session, [], before)).toBeNull();
    const after = new Date('2026-09-09T07:00:00Z');
    expect(onwardLine(session, [{ ...qr301, number: 'QR301', carrier: 'Qatar Airways' }], after)).toBeNull();
  });
});

describe('layoverLabel', () => {
  it('reads in the units a traveller says', () => {
    expect(layoverLabel(45 * 60_000)).toBe('45m');
    expect(layoverLabel(175 * 60_000)).toBe('2h 55m');
    expect(layoverLabel(3 * 3_600_000)).toBe('3h');
    expect(layoverLabel(27 * 3_600_000)).toBe('1d 3h');
  });
});
