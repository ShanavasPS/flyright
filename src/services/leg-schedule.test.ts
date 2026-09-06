import { FINNAIR_RECEIPT } from '@/services/__fixtures__/itinerary-documents';
import { formatTime } from '@/services/dates';
import { extractItinerary } from '@/services/itinerary';
import { legSchedule } from '@/services/leg-schedule';

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
