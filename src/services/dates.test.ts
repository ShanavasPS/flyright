import {
  wallClock,
  countdown,
  dayOffset,
  dayOffsetMark,
  dayOffsetSpoken,
  flightInstant,
  flightDay,
  formatDayLabel,
  formatDayLabelWithYear,
  formatTime,
  localDateString,
  tripDateTitle,
  zonedTimestamp,
} from './dates';

const NOW = new Date('2026-08-04T12:00:00Z');

describe('countdown', () => {
  it('shows hours under two days out', () => {
    expect(countdown('2026-08-05T18:00:00Z', NOW)).toEqual({ value: 30, unit: 'hours' });
  });

  it('shows days further out', () => {
    expect(countdown('2026-08-10T12:00:00Z', NOW)).toEqual({ value: 6, unit: 'days' });
  });

  it('shows elapsed time for past departures', () => {
    expect(countdown('2026-07-30T12:00:00Z', NOW)).toEqual({ value: 5, unit: 'days ago' });
  });

  it('treats departures within the hour as now', () => {
    expect(countdown('2026-08-04T12:30:00Z', NOW)).toEqual({ value: 0, unit: 'now' });
  });
});

describe('localDateString', () => {
  it('formats and offsets', () => {
    const base = new Date(2026, 7, 4); // 4 Aug 2026, local
    expect(localDateString(base)).toBe('2026-08-04');
    expect(localDateString(base, 1)).toBe('2026-08-05');
    expect(localDateString(base, -1)).toBe('2026-08-03');
  });
});

describe('tripDateTitle', () => {
  // Local noon so calendar-day math is zone-independent in the assertions.
  const now = new Date(2026, 7, 4, 12, 0, 0);
  const at = (y: number, m: number, d: number, h = 9) => new Date(y, m, d, h).toISOString();

  it('names the day, however near it is', () => {
    // Never "Today" or "In 2 days": the hero's chip a line below says that,
    // and the pair used to agree word for word all week.
    expect(tripDateTitle(at(2026, 7, 4, 23), now)).toBe(formatDay(at(2026, 7, 4, 23)));
    expect(tripDateTitle(at(2026, 7, 5, 1), now)).toBe(formatDay(at(2026, 7, 5, 1)));
    expect(tripDateTitle(at(2026, 7, 6), now)).toBe(formatDay(at(2026, 7, 6)));
    expect(tripDateTitle(at(2026, 7, 2), now)).toBe(formatDay(at(2026, 7, 2)));
  });

  it('carries the year only when it differs from this one', () => {
    expect(tripDateTitle(at(2026, 7, 12), now)).toBe(formatDay(at(2026, 7, 12)));
    expect(tripDateTitle(at(2027, 0, 3), now)).toMatch(/2027/);
    expect(tripDateTitle(at(2025, 7, 4), now)).toMatch(/2025/);
  });

  it('is empty for unparsable input', () => {
    expect(tripDateTitle('not-a-date', now)).toBe('');
  });
});

function formatDay(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}


/** "04:55 pm" / "16:55" → 1015, so assertions survive a 12-hour locale. */
function minutesOfDay(label: string): number {
  const [, h, m] = label.match(/(\d{1,2}):(\d{2})/)!;
  let hour = Number(h);
  if (/p/i.test(label) && hour !== 12) hour += 12;
  if (/a/i.test(label) && hour === 12) hour = 0;
  return hour * 60 + Number(m);
}

const at = (h: number, m: number) => h * 60 + m;

// These assertions are absolute on purpose: no test can move the zone V8
// cached at startup, so the guard is that they must hold wherever the suite
// runs — a laptop in Helsinki, CI in UTC, a phone in Kolkata. Every one of
// them fails if the device's zone gets back into a flight time.
describe('formatTime — the clock belongs to the airport', () => {
  // BA777 ARN→LHR: 11:25Z off stand, 14:15Z on stand. Arlanda reads that as
  // 12:25 (UTC+1 in November), Heathrow as 14:15 (UTC+0).
  const departure = '2026-11-28T11:25Z';
  const arrival = '2026-11-28T14:15Z';

  it('reads one instant as each airport reads it', () => {
    expect(minutesOfDay(formatTime(departure, 'Europe/Stockholm'))).toBe(at(12, 25));
    expect(minutesOfDay(formatTime(arrival, 'Europe/London'))).toBe(at(14, 15));
  });

  it('follows the zone it is given, not the one the reader is in', () => {
    // 16:55 is what a phone on IST used to show for this departure. It is a
    // true clock reading — just of the wrong place, which is the whole bug.
    expect(minutesOfDay(formatTime(departure, 'Asia/Kolkata'))).toBe(at(16, 55));
    expect(minutesOfDay(formatTime(departure, 'America/Los_Angeles'))).toBe(at(3, 25));
  });

  it('renders a manual entry as the traveler typed it, unshifted', () => {
    // Zone-less strings are already wall clocks — converting one would move a
    // time the traveler chose themselves, and there is no zone to convert from.
    expect(minutesOfDay(formatTime('2026-11-28T11:30:00', 'Asia/Kolkata'))).toBe(at(11, 30));
    expect(minutesOfDay(formatTime('2026-11-28T11:30:00'))).toBe(at(11, 30));
  });

  it('has nothing to show for a missing or unparsable time', () => {
    expect(formatTime(null)).toBe('—');
    expect(formatTime('not-a-time')).toBe('—');
  });
});

describe('formatDayLabel — the day belongs to the airport too', () => {
  // 23:40 in Los Angeles on 3 December — already the 4th in UTC, and the 4th
  // again in Helsinki, so only the airport's own calendar gets this right.
  const lateNight = '2026-12-04T07:40Z';

  it('names the day the airport is having', () => {
    expect(formatDayLabel(lateNight, 'America/Los_Angeles')).toMatch(/\b3\b/);
    expect(formatDayLabelWithYear(lateNight, 'America/Los_Angeles')).toMatch(/\b3\b/);
  });

  it('leaves a plain date alone', () => {
    expect(formatDayLabel('2026-12-04', 'America/Los_Angeles')).toMatch(/\b4\b/);
  });
});

describe('tripDateTitle — the day it is where the flight leaves', () => {
  it('dates the trip by the calendar at the airport it leaves from', () => {
    // 23:00 on the 4th in Auckland is 11:00 on the 4th UTC — but a departure
    // at 12:00 UTC is already the 5th there, and must be titled the 5th.
    const now = new Date('2026-08-04T09:00:00Z');
    expect(tripDateTitle('2026-08-04T09:00:00Z', now, 'Pacific/Auckland')).toMatch(/\b4\b/);
    expect(tripDateTitle('2026-08-04T12:00:00Z', now, 'Pacific/Auckland')).toMatch(/\b5\b/);
  });
});

describe('zonedTimestamp — a printed clock back into an instant', () => {
  it('reads the ticket time as the airport means it', () => {
    // The receipt prints 11:30 at Arlanda on 28 November; Sweden is on UTC+1
    // then, so that is 10:30Z — and it must render back as 11:30.
    const iso = zonedTimestamp('2026-11-28', '11:30', 'Europe/Stockholm');
    expect(iso).toBe('2026-11-28T10:30:00.000Z');
    expect(minutesOfDay(formatTime(iso, 'Europe/Stockholm'))).toBe(at(11, 30));
  });

  it('uses the offset in force on the day, not today’s', () => {
    // Same airport, same clock, summer time: UTC+2, so an hour earlier in UTC.
    expect(zonedTimestamp('2026-07-28', '11:30', 'Europe/Stockholm')).toBe(
      '2026-07-28T09:30:00.000Z',
    );
    // A zone that has never observed daylight saving, at a half-hour offset.
    expect(zonedTimestamp('2026-11-28', '11:30', 'Asia/Kolkata')).toBe(
      '2026-11-28T06:00:00.000Z',
    );
  });

  it('survives midnight and the far side of the date line', () => {
    expect(zonedTimestamp('2026-11-28', '00:15', 'Pacific/Auckland')).toBe(
      '2026-11-27T11:15:00.000Z',
    );
  });

  it('gives up rather than guess', () => {
    expect(zonedTimestamp('2026-11-28', '11:30', null)).toBeNull();
    expect(zonedTimestamp('2026-11-28', 'half past', 'Europe/Stockholm')).toBeNull();
    expect(zonedTimestamp('not-a-day', '11:30', 'Europe/Stockholm')).toBeNull();
  });
});

describe('flightDay — the date a lookup has to ask about', () => {
  it('names the local day, not the UTC one', () => {
    // 00:15 on 28 November in Auckland is 11:15Z on the 27th. Slicing the
    // stored instant asks the provider about a flight that doesn't exist.
    const departure = '2026-11-27T11:15:00.000Z';
    expect(departure.slice(0, 10)).toBe('2026-11-27');
    expect(flightDay(departure, 'Pacific/Auckland')).toBe('2026-11-28');
  });

  it('holds the other way too, west of UTC', () => {
    // 22:40 on 3 December in Los Angeles is already the 4th in UTC.
    expect(flightDay('2026-12-04T06:40:00.000Z', 'America/Los_Angeles')).toBe('2026-12-03');
  });

  it('leaves the day alone when it is already local', () => {
    expect(flightDay('2026-11-28T11:30:00', 'Pacific/Auckland')).toBe('2026-11-28');
    expect(flightDay('2026-11-28T11:15:00.000Z', null)).toBe('2026-11-28');
  });
});

describe('wallClock', () => {
  it('reads the airport clock out of an instant', () => {
    expect(wallClock('2026-01-18T22:35:00Z', 'Asia/Kolkata')).toBe('04:05');
    expect(wallClock('2026-01-18T03:10:00Z', 'Asia/Qatar')).toBe('06:10');
  });
  it('keeps a bare wall clock as it is', () => {
    expect(wallClock('2026-01-18T04:05:00', 'Asia/Kolkata')).toBe('04:05');
  });
  it('is null for nothing or garbage', () => {
    expect(wallClock(null, 'Asia/Kolkata')).toBeNull();
    expect(wallClock('not a date', 'Asia/Kolkata')).toBeNull();
  });
});

describe('bare wall clocks never touch the phone zone', () => {
  const bare = '2026-09-09T04:15:00';
  it('formatTime prints the digits as written', () => {
    const expected = new Date(Date.UTC(2026, 8, 9, 4, 15)).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
    expect(formatTime(bare)).toBe(expected);
    expect(formatTime(bare, 'Asia/Qatar')).toBe(expected);
  });
  it('formatDayLabel names the day on the string', () => {
    expect(formatDayLabel(bare)).toBe(formatDayLabel('2026-09-09T22:00:00'));
    expect(formatDayLabelWithYear('2026-09-09T00:30:00')).toBe(formatDayLabelWithYear(bare));
  });
  it('flightInstant pins a bare clock to its airport, and passes instants through', () => {
    // 04:15 at COK (UTC+5:30) is 22:45Z the day before.
    expect(flightInstant(bare, 'Asia/Kolkata')).toBe(Date.parse('2026-09-08T22:45:00Z'));
    expect(flightInstant('2026-09-08T22:45:00Z', 'Asia/Qatar')).toBe(Date.parse('2026-09-08T22:45:00Z'));
  });
  it('countdown counts from the airport\'s moment', () => {
    const now = new Date('2026-09-08T20:45:00Z');
    expect(countdown(bare, now, 'Asia/Kolkata')).toEqual({ value: 2, unit: 'hours' });
  });
  it('tripDateTitle reads the year off a bare clock', () => {
    expect(tripDateTitle('2025-09-09T04:15:00', new Date('2026-09-09T12:00:00Z'), 'Asia/Kolkata')).toBe(
      formatDayLabelWithYear('2025-09-09T04:15:00'),
    );
  });
});

describe('dayOffset', () => {
  it('counts calendar days in the airports’ own zones, not elapsed hours', () => {
    // Las Vegas 23:59 → Dallas 04:34 next morning: +1 though it's 2h35 in the air.
    expect(dayOffset('2025-10-09T06:59Z', 'America/Los_Angeles', '2025-10-09T09:34Z', 'America/Chicago')).toBe(1);
    // Kochi 04:15 → Doha 06:05, seven hours' flying, same day both ends.
    expect(dayOffset('2026-07-24T22:45Z', 'Asia/Kolkata', '2026-07-25T03:05Z', 'Asia/Qatar')).toBe(0);
    // Doha 19:40 → Kochi 02:45: the small hours of the next day.
    expect(dayOffset('2026-08-02T16:40Z', 'Asia/Qatar', '2026-08-02T21:15Z', 'Asia/Kolkata')).toBe(1);
    // Apia → Los Angeles across the dateline lands the day before.
    expect(dayOffset('2026-03-10T11:30Z', 'Pacific/Apia', '2026-03-10T19:30Z', 'America/Los_Angeles')).toBe(-1);
    // A journal entry's bare wall clocks read as written.
    expect(dayOffset('2026-09-09T04:15:00', 'Asia/Kolkata', '2026-09-10T02:45:00', 'Asia/Qatar')).toBe(1);
    expect(dayOffset('nonsense', null, '2026-09-10T02:45:00', null)).toBeNull();
  });

  it('marks the clock the way a timetable does, and says it for a screen reader', () => {
    expect(dayOffsetMark(0)).toBe('');
    expect(dayOffsetMark(null)).toBe('');
    expect(dayOffsetMark(1)).toBe('⁺¹');
    expect(dayOffsetMark(2)).toBe('⁺²');
    expect(dayOffsetMark(-1)).toBe('⁻¹');
    expect(dayOffsetSpoken(1)).toBe('arrives next day');
    expect(dayOffsetSpoken(-1)).toBe('arrives the day before');
    expect(dayOffsetSpoken(2)).toBe('arrives 2 days later');
    expect(dayOffsetSpoken(0)).toBeNull();
  });
});
