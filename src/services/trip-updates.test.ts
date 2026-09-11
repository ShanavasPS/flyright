import { placeFor, updateWindow, updateWindowOpen } from '../../convex/updatesShared';
import { agoLabel, captionOf, photoAspect, updateContext } from './trip-updates';

/** HEL 07:10 → DOH 14:25 (local clocks), zoned as the lookup stores them. */
const trip = {
  fromCode: 'HEL',
  toCode: 'DOH',
  scheduledDeparture: '2026-09-11T04:10:00Z',
  scheduledArrival: '2026-09-11T11:25:00Z',
};

describe('updateWindow', () => {
  it('opens at midnight at the origin on the departure day', () => {
    const { opensAt } = updateWindow(trip);
    // Helsinki is UTC+3 in September: local midnight is 21:00Z the day before.
    expect(new Date(opensAt).toISOString()).toBe('2026-09-10T21:00:00.000Z');
  });

  it('closes a day after the flight is due to land', () => {
    const { closesAt } = updateWindow(trip);
    expect(new Date(closesAt).toISOString()).toBe('2026-09-12T11:25:00.000Z');
  });

  it('a late recorded landing extends the window', () => {
    const { closesAt } = updateWindow(trip, '2026-09-11T14:00:00Z');
    expect(new Date(closesAt).toISOString()).toBe('2026-09-12T14:00:00.000Z');
  });

  it('is closed the evening before and two days after', () => {
    expect(updateWindowOpen(trip, Date.parse('2026-09-10T18:00:00Z'))).toBe(false);
    expect(updateWindowOpen(trip, Date.parse('2026-09-11T06:00:00Z'))).toBe(true);
    expect(updateWindowOpen(trip, Date.parse('2026-09-12T09:00:00Z'))).toBe(true);
    expect(updateWindowOpen(trip, Date.parse('2026-09-13T12:00:00Z'))).toBe(false);
  });

  it('pins a manual row’s bare wall clocks to the airport', () => {
    const manual = {
      ...trip,
      scheduledDeparture: '2026-09-11T07:10:00',
      scheduledArrival: '2026-09-11T14:25:00',
    };
    expect(updateWindow(manual)).toEqual(updateWindow(trip));
  });
});

describe('placeFor', () => {
  it('reads the stage when the session has one', () => {
    const now = Date.parse('2026-09-11T06:00:00Z');
    expect(placeFor(trip, 'security', now)).toBe('HEL');
    expect(placeFor(trip, 'boarded', now)).toBe('HEL');
    expect(placeFor(trip, 'departed', now)).toBeNull();
    expect(placeFor(trip, 'landed', now)).toBe('DOH');
  });

  it('falls back to the timetable without a stage', () => {
    expect(placeFor(trip, null, Date.parse('2026-09-11T02:00:00Z'))).toBe('HEL');
    expect(placeFor(trip, null, Date.parse('2026-09-11T08:00:00Z'))).toBeNull();
    expect(placeFor(trip, null, Date.parse('2026-09-11T20:00:00Z'))).toBe('DOH');
  });
});

describe('updateContext', () => {
  it('names the stage and the city', () => {
    expect(updateContext({ stage: 'security', place: 'HEL' })).toBe('Through security · Helsinki');
    expect(updateContext({ stage: 'boarded', place: 'HEL' })).toBe('On board');
    expect(updateContext({ stage: 'departed', place: null })).toBe('In the air');
    expect(updateContext({ stage: 'landed', place: 'DOH' })).toBe('Landed · Doha');
  });

  it('is just the city with no stage, and nothing with neither', () => {
    expect(updateContext({ stage: null, place: 'DOH' })).toBe('Doha');
    expect(updateContext({ stage: null, place: null })).toBeNull();
  });
});

describe('agoLabel', () => {
  const now = new Date('2026-09-11T12:00:00Z');
  it('rounds to the nearest unit', () => {
    expect(agoLabel('2026-09-11T11:59:30Z', now)).toBe('just now');
    expect(agoLabel('2026-09-11T11:48:00Z', now)).toBe('12m ago');
    expect(agoLabel('2026-09-11T09:10:00Z', now)).toBe('3h ago');
  });
  it('gives the day once it is more than a day old', () => {
    expect(agoLabel('2026-09-09T09:10:00Z', now)).toMatch(/Sep/);
  });
});

describe('captionOf and photoAspect', () => {
  it('says what a bare photo is', () => {
    expect(captionOf({ text: '', photoUrl: 'https://x/y' })).toBe('Shared a photo');
    expect(captionOf({ text: 'Sunrise', photoUrl: null })).toBe('Sunrise');
  });
  it('keeps landscape, widens portrait, defaults unknown', () => {
    expect(photoAspect({ width: 1600, height: 900 })).toBeCloseTo(1.777, 2);
    expect(photoAspect({ width: 900, height: 1600 })).toBe(1.25);
    expect(photoAspect({ width: null, height: null })).toBe(1.5);
  });
});
