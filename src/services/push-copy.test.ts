import { daysUntil, relativeDay, tripsAddedCopy } from '../../convex/pushCopy';

// 8 Sep 2026, 09:00 in Helsinki (06:00Z).
const NOW = new Date('2026-09-08T06:00:00Z');

describe('relativeDay', () => {
  it('speaks like a friend up to a few weeks out', () => {
    expect(relativeDay(0, 'x')).toBe('today');
    expect(relativeDay(1, 'x')).toBe('tomorrow');
    expect(relativeDay(2, 'x')).toBe('in 2 days');
    expect(relativeDay(6, 'x')).toBe('in 6 days');
    expect(relativeDay(7, 'x')).toBe('in a week');
    expect(relativeDay(10, 'x')).toBe('in a week');
    expect(relativeDay(11, 'x')).toBe('in 2 weeks');
    expect(relativeDay(18, 'x')).toBe('in 3 weeks');
    expect(relativeDay(24, 'x')).toBe('in 3 weeks');
  });
  it('falls back to the date from about a month out', () => {
    expect(relativeDay(25, 'Sat 3 Oct')).toBe('on Sat 3 Oct');
    expect(relativeDay(81, 'Sat 28 Nov')).toBe('on Sat 28 Nov');
  });
});

describe('daysUntil', () => {
  it('counts calendar days on the departure airport\'s calendar', () => {
    // 9 Sep 07:30 at HEL is 04:30Z — tomorrow, whatever the clock says.
    expect(daysUntil('2026-09-09T04:30:00Z', 'HEL', NOW)).toBe(1);
    // A late-evening Helsinki departure stored as the next UTC day is still tomorrow.
    expect(daysUntil('2026-09-09T22:30:00+03:00', 'HEL', NOW)).toBe(1);
    // A journal entry keeps its wall-clock date.
    expect(daysUntil('2026-09-10T10:00:00', 'BRU', NOW)).toBe(2);
  });
});

describe('tripsAddedCopy', () => {
  const trip = {
    number: 'AY1331',
    carrier: 'Finnair',
    fromCode: 'HEL',
    toCode: 'LHR',
    scheduledDeparture: '2026-09-09T04:30:00Z',
  };
  it('puts when in the title and the leg in the body', () => {
    expect(tripsAddedCopy('Shanavas', [trip], NOW)).toEqual({
      title: 'Shanavas is flying tomorrow',
      body: "AY1331 · HEL → LHR · Wed 9 Sep. You'll get a heads-up the day before.",
    });
  });
  it('moves the count into the body for several trips', () => {
    const later = { ...trip, number: 'AY1332', scheduledDeparture: '2026-09-20T10:00:00Z' };
    expect(tripsAddedCopy('Shanavas', [trip, later], NOW)).toEqual({
      title: 'Shanavas is flying tomorrow',
      body: "2 trips added — first AY1331 · HEL → LHR · Wed 9 Sep. You'll get a heads-up the day before each.",
    });
  });
  it('names the date when the trip is a long way off', () => {
    const far = { ...trip, scheduledDeparture: '2026-11-28T10:30:00Z' };
    expect(tripsAddedCopy('Dee', [far], NOW).title).toBe('Dee is flying on Sat 28 Nov');
  });
});
