import type { FlightStatus } from '@/services/flight-lookup';
import type { JourneyRow } from '@/services/journeys';
import { scheduleChange, shiftLabel, type ChangeCandidate } from '@/services/schedule-change';

const NOW = new Date('2026-09-06T12:00:00Z');

/** The trip as the receipt saved it: BA777 leaving Arlanda at 11:30 local. */
function ticket(overrides: Partial<ChangeCandidate> = {}): ChangeCandidate {
  return {
    scheduledDeparture: '2026-11-28T10:30:00.000Z',
    scheduledArrival: '2026-11-28T13:25:00.000Z',
    createdAt: '2026-09-05T18:00:00.000Z',
    source: 'lookup',
    ...overrides,
  };
}

function provider(
  overrides: Partial<Pick<FlightStatus, 'scheduledDeparture' | 'scheduledArrival' | 'scheduleUpdatedAt'>> = {},
) {
  return {
    scheduledDeparture: '2026-11-28T11:25Z',
    scheduledArrival: '2026-11-28T14:15Z',
    scheduleUpdatedAt: '2026-08-20T07:25Z',
    ...overrides,
  };
}

describe('scheduleChange', () => {
  it('ignores a provider record older than the ticket', () => {
    // The exact case this was built for: a receipt issued on 5 September
    // against a schedule row last revised on 20 August. The provider's 12:25
    // is the stale number; the ticket's 11:30 stands and nobody is told.
    expect(scheduleChange(ticket(), provider(), NOW)).toBeNull();
  });

  it('adopts a schedule the airline published after the ticket', () => {
    const change = scheduleChange(
      ticket(),
      provider({ scheduleUpdatedAt: '2026-09-06T06:00Z' }),
      NOW,
    );
    expect(change).toEqual({
      departure: '2026-11-28T11:25Z',
      arrival: '2026-11-28T14:15Z',
      departureShiftMinutes: 55,
      arrivalShiftMinutes: 50,
    });
  });

  it('reports a flight pulled earlier as a negative shift', () => {
    const change = scheduleChange(
      ticket(),
      provider({
        scheduledDeparture: '2026-11-28T09:00Z',
        scheduledArrival: '2026-11-28T11:55Z',
        scheduleUpdatedAt: '2026-09-06T06:00Z',
      }),
      NOW,
    );
    expect(change?.departureShiftMinutes).toBe(-90);
  });

  it('lets an operational record speak even without a revision stamp', () => {
    // Inside the tracking window the provider's record is live rather than a
    // schedule-database projection, and a move there is the one that can
    // actually cost someone their flight.
    const tomorrow = {
      scheduledDeparture: '2026-09-07T10:30:00.000Z',
      scheduledArrival: '2026-09-07T13:25:00.000Z',
    };
    const change = scheduleChange(
      ticket(tomorrow),
      { ...tomorrow, scheduledDeparture: '2026-09-07T11:25Z', scheduleUpdatedAt: null },
      NOW,
    );
    expect(change?.departureShiftMinutes).toBe(55);
  });

  it('stays quiet about a stampless record months out', () => {
    expect(
      scheduleChange(ticket(), provider({ scheduleUpdatedAt: null }), NOW),
    ).toBeNull();
  });

  it('treats a shift under five minutes as rounding, not a decision', () => {
    expect(
      scheduleChange(
        ticket(),
        provider({
          scheduledDeparture: '2026-11-28T10:33Z',
          scheduledArrival: '2026-11-28T13:27Z',
          scheduleUpdatedAt: '2026-09-06T06:00Z',
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it('never rewrites a journal entry', () => {
    expect(
      scheduleChange(
        ticket({ source: 'manual' }),
        provider({ scheduleUpdatedAt: '2026-09-06T06:00Z' }),
        NOW,
      ),
    ).toBeNull();
  });

  it('needs two instants to compare — a bare wall clock has no fixed meaning', () => {
    expect(
      scheduleChange(
        ticket({ scheduledDeparture: '2026-11-28T11:30:00' }),
        provider({ scheduleUpdatedAt: '2026-09-06T06:00Z' }),
        NOW,
      ),
    ).toBeNull();
  });

  it('has nothing to compare when the provider knows no schedule', () => {
    expect(
      scheduleChange(ticket(), { ...provider(), scheduledDeparture: null }, NOW),
    ).toBeNull();
  });
});

describe('shiftLabel', () => {
  it('says which way and by how much', () => {
    expect(shiftLabel(55)).toBe('55 min later');
    expect(shiftLabel(-90)).toBe('1 h 30 min earlier');
    expect(shiftLabel(120)).toBe('2 h later');
  });
});

/** The row type has to keep satisfying the candidate shape the rule reads. */
it('reads the fields a stored journey actually has', () => {
  const row = ticket() as Pick<JourneyRow, keyof ChangeCandidate>;
  expect(row.source).toBe('lookup');
});
