import { FINNAIR_RECEIPT } from '@/services/__fixtures__/itinerary-documents';
import { formatTime } from '@/services/dates';
import { extractItinerary } from '@/services/itinerary';
import { legSchedule, maxFlightMs } from '@/services/leg-schedule';

/** "04:55 pm" / "16:55" → "16:55", so assertions survive a 12-hour locale. */
function clock(label: string): string {
  const [, h, m] = label.match(/(\d{1,2}):(\d{2})/)!;
  let hour = Number(h);
  if (/p/i.test(label) && hour !== 12) hour += 12;
  if (/a/i.test(label) && hour === 12) hour = 0;
  return `${`${hour}`.padStart(2, '0')}:${m}`;
}

/** The provider's answer for BA777 on 28 Nov 2026: a schedule 55 minutes off
 * what the ticket says, which is the gap that has to resolve the ticket's way. */
const LOOKUP = {
  date: '2026-11-28',
  from: { code: 'ARN', country: 'SE' },
  to: { code: 'LHR', country: 'GB' },
  scheduledDeparture: '2026-11-28T11:25Z',
  scheduledArrival: '2026-11-28T14:15Z',
};

const ARN_LHR = {
  date: '2026-11-28',
  arrivalDate: '2026-11-28',
  depTime: '11:30',
  arrTime: '13:25',
  fromCode: 'ARN',
  toCode: 'LHR',
};

describe('legSchedule', () => {
  it('keeps the times the ticket printed, over the provider’s schedule', () => {
    const { departure, arrival } = legSchedule(ARN_LHR, LOOKUP);
    // 11:30 at Arlanda in November (UTC+1) and 13:25 at Heathrow (UTC+0).
    expect(departure).toBe('2026-11-28T10:30:00.000Z');
    expect(arrival).toBe('2026-11-28T13:25:00.000Z');
  });

  it('stores an instant, so it reads back as the printed clock anywhere', () => {
    const { departure, arrival } = legSchedule(ARN_LHR, LOOKUP);
    expect(clock(formatTime(departure, 'Europe/Stockholm'))).toBe('11:30');
    expect(clock(formatTime(arrival, 'Europe/London'))).toBe('13:25');
    // The same row read from a phone in India: the same two clocks.
    expect(clock(formatTime(departure, 'Europe/Stockholm'))).not.toBe('16:55');
  });

  it('falls back to the lookup for a time the document never printed', () => {
    const { departure, arrival } = legSchedule(
      { ...ARN_LHR, depTime: null, arrTime: null },
      LOOKUP,
    );
    expect(departure).toBe('2026-11-28T11:25Z');
    expect(arrival).toBe('2026-11-28T14:15Z');
  });

  it('keeps a bare wall clock when the airport has no zone to convert from', () => {
    const { departure } = legSchedule({ ...ARN_LHR, fromCode: 'ZZZ' }, null);
    expect(departure).toBe('2026-11-28T11:30:00');
    expect(clock(formatTime(departure))).toBe('11:30');
  });

  it('has nothing to say about a leg with neither a ticket time nor a lookup', () => {
    expect(legSchedule({ ...ARN_LHR, depTime: null, arrTime: null }, null)).toEqual({
      departure: null,
      arrival: null,
    });
  });
});

describe('legSchedule — a printed departure no flight could have left at', () => {
  // QR516 DOH 19:50 → COK 02:45 (+1), saved leaving at 04:20: the ticket's
  // "CONFIRMED 4:20" flight time read as the departure clock.
  const QR516 = { date: '2026-10-04', arrivalDate: '2026-10-05', depTime: '04:20', arrTime: null, fromCode: 'DOH', toCode: 'COK' };
  const QR516_LOOKUP = {
    date: '2026-10-04',
    from: { code: 'DOH', country: 'QA' },
    to: { code: 'COK', country: 'IN' },
    scheduledDeparture: '2026-10-04T16:50Z',
    scheduledArrival: '2026-10-04T21:15Z',
  };

  it('takes the provider’s departure when the printed one would make the flight a day long', () => {
    expect(legSchedule(QR516, QR516_LOOKUP).departure).toBe('2026-10-04T16:50Z');
  });

  it('keeps a printed departure that a re-time moved', () => {
    // An hour later than the provider says, and still a flight to its arrival.
    expect(legSchedule({ ...QR516, depTime: '20:50' }, QR516_LOOKUP).departure).toBe('2026-10-04T17:50:00.000Z');
  });
});

describe('legSchedule — an arrival date from elsewhere on the page', () => {
  // AA79 as imported: the printed clocks were right, the arrival date was the
  // fare's "not valid after" day, twelve days on.
  const AA79 = {
    date: '2026-10-04',
    arrivalDate: '2026-10-16',
    depTime: '14:45',
    arrTime: '19:10',
    fromCode: 'LHR',
    toCode: 'DFW',
  };
  const AA79_LOOKUP = {
    date: '2026-10-04',
    from: { code: 'LHR', country: 'GB' },
    to: { code: 'DFW', country: 'US' },
    scheduledDeparture: '2026-10-04T13:45Z',
    scheduledArrival: '2026-10-05T00:10Z',
  };

  it('lands the printed clock on the departure’s own day', () => {
    // 19:10 in Dallas (UTC−5) on 4 October, ten hours and 25 minutes after 14:45 in London.
    expect(legSchedule(AA79, null).arrival).toBe('2026-10-05T00:10:00.000Z');
    expect(legSchedule(AA79, AA79_LOOKUP).arrival).toBe('2026-10-05T00:10:00.000Z');
  });

  it('takes the provider’s arrival over a printed one no flight could make', () => {
    // Within the two-day date window, but 34 hours after take-off.
    const { arrival } = legSchedule({ ...AA79, arrivalDate: '2026-10-05', arrTime: '23:10' }, AA79_LOOKUP);
    expect(arrival).toBe('2026-10-05T00:10Z');
  });

  it('drops a printed next-day arrival that would make a short hop a day long', () => {
    // AA1234 DFW 20:33 → MKE 22:57 the same evening, saved as landing the next night.
    const { arrival } = legSchedule(
      { date: '2026-08-18', arrivalDate: '2026-08-19', depTime: '20:33', arrTime: '22:57', fromCode: 'DFW', toCode: 'MKE' },
      null,
    );
    expect(arrival).toBe('2026-08-19T03:57:00.000Z');
  });

  it('puts the printed clock on the day the printed flight time points at', () => {
    // 10 h 25 min after 14:45 in London is 19:10 in Dallas the same day,
    // whatever later date sat beside the row.
    const { arrival } = legSchedule({ ...AA79, duration: 625 }, null);
    expect(arrival).toBe('2026-10-05T00:10:00.000Z');
  });

  it('prefers the flight time to a printed next-day date that is still within reach', () => {
    // Printed as landing on the 5th: a date a flight could make (34 h is not,
    // but the date check alone lets the 5th through), the flight time says the 4th.
    const { arrival } = legSchedule({ ...AA79, arrivalDate: '2026-10-05', duration: 625 }, null);
    expect(arrival).toBe('2026-10-05T00:10:00.000Z');
  });

  it('reads the arrival off the flight time when the document prints no arrival clock', () => {
    const { arrival } = legSchedule({ ...AA79, arrTime: null, arrivalDate: null, duration: 625 }, null);
    expect(arrival).toBe('2026-10-05T00:10:00.000Z');
  });

  it('does not force a clock the flight time disagrees with by hours', () => {
    // A printed 9 h against a clock that means 10 h 25: the clock stands, on its own day.
    const { arrival } = legSchedule({ ...AA79, arrivalDate: '2026-10-04', duration: 9 * 60 }, null);
    expect(arrival).toBe('2026-10-05T00:10:00.000Z');
  });

  it('allows a long flight that stops under one number, like QF1 through Singapore', () => {
    // Sydney 16:00 (UTC+11) → London 05:35 next morning: 24 h 35 min gate to gate.
    const { arrival } = legSchedule(
      { date: '2026-11-01', arrivalDate: '2026-11-02', depTime: '16:00', arrTime: '05:35', fromCode: 'SYD', toCode: 'LHR' },
      null,
    );
    expect(arrival).toBe('2026-11-02T05:35:00.000Z');
  });

  it('keeps a printed flight time longer than any nonstop', () => {
    const { arrival } = legSchedule(
      { date: '2026-11-01', arrivalDate: null, depTime: '16:00', arrTime: '05:35', fromCode: 'SYD', toCode: 'LHR', duration: 24 * 60 + 35 },
      null,
    );
    expect(arrival).toBe('2026-11-02T05:35:00.000Z');
  });

  it('still lands a westbound leg two days on', () => {
    // LAX 22:40 → SIN 07:00 two days later: the date line, not a stray date.
    const { departure, arrival } = legSchedule(
      { date: '2026-10-04', arrivalDate: '2026-10-06', depTime: '22:40', arrTime: '07:00', fromCode: 'LAX', toCode: 'SIN' },
      null,
    );
    expect(departure).toBe('2026-10-05T05:40:00.000Z');
    expect(arrival).toBe('2026-10-05T23:00:00.000Z');
  });
});

describe('the receipt this was reported from', () => {
  it('shows every leg at the clock the itinerary prints', () => {
    const { segments } = extractItinerary(FINNAIR_RECEIPT, new Date('2026-09-06T12:00:00Z'));
    const zones: Record<string, string> = {
      ARN: 'Europe/Stockholm',
      LHR: 'Europe/London',
      LAS: 'America/Los_Angeles',
      LAX: 'America/Los_Angeles',
      HEL: 'Europe/Helsinki',
    };
    const shown = segments.map((s) => {
      const { departure, arrival } = legSchedule(s, null);
      return [
        s.flight,
        s.fromCode,
        clock(formatTime(departure, zones[s.fromCode!])),
        s.toCode,
        clock(formatTime(arrival, zones[s.toCode!])),
      ].join(' ');
    });
    expect(shown).toEqual([
      'BA777 ARN 11:30 LHR 13:25',
      'AY5435 LHR 16:05 LAS 18:50',
      'AY4121 LAS 12:00 LAX 13:20',
      'AY2 LAX 18:50 HEL 15:20',
      'AY815 HEL 16:50 ARN 16:55',
    ]);
  });
});

describe('maxFlightMs', () => {
  const hours = (from: string | null, to: string | null) => maxFlightMs(from, to) / 3_600_000;

  it('grows with the distance between the airports', () => {
    expect(hours('DFW', 'MKE')).toBeGreaterThan(6);
    expect(hours('DFW', 'MKE')).toBeLessThan(10);
    expect(hours('LHR', 'DFW')).toBeGreaterThan(20);
    expect(hours('LHR', 'DFW')).toBeLessThan(28);
    // Sydney–London: room for today's one-stop QF1 and the coming nonstops.
    expect(hours('SYD', 'LHR')).toBeGreaterThan(40);
  });

  it('refuses only an absurd gap when a route has no coordinates', () => {
    expect(hours('ZZZ', 'LHR')).toBe(48);
    expect(hours(null, null)).toBe(48);
  });
});
