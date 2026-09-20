import { flightInstant } from '../../convex/airportZones';
import {
  ACTIVITY_LIFETIME_MS,
  buildContentState,
  flightProgress,
  liveCountdown,
  liveLead,
  nextPollDelayMs,
  sessionExpiryFor,
  shouldStartActivity,
  liveUntil,
  preferredSession,
  stillLive,
  type LiveLeadInput,
  heldOnGround,
  presumedFlightStage,
} from '../../convex/liveShared';
import type { Doc } from '../../convex/_generated/dataModel';

/** A manual COK→DOH row as the device uploads it: bare wall clocks, no zone.
 * 04:15 in Kochi is 22:45Z the evening before; 06:05 in Doha is 03:05Z. */
function session(overrides: Partial<Doc<'liveSessions'>> = {}): Doc<'liveSessions'> {
  return {
    _id: 'jd7' as Doc<'liveSessions'>['_id'],
    _creationTime: 0,
    userId: 'user_1',
    naturalKey: 'QR517-COK-DOH-2026-09-09',
    number: 'QR517',
    carrier: 'Qatar Airways',
    fromCode: 'COK',
    toCode: 'DOH',
    scheduledDeparture: '2026-09-09T04:15:00',
    scheduledArrival: '2026-09-09T06:05:00',
    currentStage: null,
    stageTimes: {},
    notifiedStages: {},
    notifiedDelayBucket: null,
    notifiedGate: null,
    pendingNotify: false,
    flightStatus: null,
    delayMinutes: null,
    gate: null,
    terminal: null,
    baggageBelt: null,
    estimatedDeparture: null,
    actualDeparture: null,
    estimatedArrival: null,
    actualArrival: null,
    status: 'active',
    shareToken: null,
    activityId: 'QR517-COK-DOH-2026-09-09~abc',
    pollScheduledId: null,
    lastCheckedAt: null,
    expiresAt: '2026-09-11T06:05:00.000Z',
    createdAt: '2026-09-08T08:57:22.856Z',
    updatedAt: '2026-09-08T08:57:22.856Z',
    ...overrides,
  } as Doc<'liveSessions'>;
}

describe('flightInstant (server)', () => {
  it('pins a bare wall clock to its airport instead of reading it as UTC', () => {
    expect(flightInstant('2026-09-09T04:15:00', 'COK')).toBe(Date.parse('2026-09-08T22:45Z'));
    expect(flightInstant('2026-09-09T06:05:00', 'DOH')).toBe(Date.parse('2026-09-09T03:05Z'));
  });
  it('passes zoned strings through and gives NaN for nothing', () => {
    expect(flightInstant('2026-09-09T06:00:00.000Z', 'DOH')).toBe(Date.parse('2026-09-09T06:00Z'));
    expect(flightInstant(null, 'DOH')).toBeNaN();
  });
});

describe('liveCountdown', () => {
  it('runs to departure, then arrival, then nothing', () => {
    expect(liveCountdown(null, 100, 200)).toEqual({ end: 100, kind: 'departure' });
    expect(liveCountdown('boarded', 100, 200)).toEqual({ end: 100, kind: 'departure' });
    expect(liveCountdown('departed', 100, 200)).toEqual({ end: 200, kind: 'arrival' });
    expect(liveCountdown('landed', 100, 200)).toBeNull();
    expect(liveCountdown('departed', 100, NaN)).toBeNull();
  });
});

describe('buildContentState on a manual (bare wall clock) row', () => {
  it('counts down to the pinned departure and prints the clock as written', () => {
    const now = Date.parse('2026-09-08T20:00Z'); // 2h45 before the 22:45Z take-off
    const state = buildContentState(session(), now);
    expect(state.headline).toBe('Flight in 3h');
    expect(state.countdownKind).toBe('departure');
    expect(state.countdownEnd).toBe(Date.parse('2026-09-08T22:45Z'));
    expect(state.departsAt).toBe(Date.parse('2026-09-08T22:45Z'));
    expect(state.arrivesAt).toBe(Date.parse('2026-09-09T03:05Z'));
    expect(state.depTime).toBe('04:15');
    expect(state.arrTime).toBe('06:05');
    expect(state.compactLabel).toBe('04:15');
  });

  it('in the air: counts to the estimated arrival, progress follows the flown share', () => {
    const now = Date.parse('2026-09-09T00:55Z'); // half-way between 22:45Z and 03:05Z
    const s = session({
      currentStage: 'departed',
      stageTimes: { departed: '2026-09-08T22:45:00.000Z' },
    });
    const state = buildContentState(s, now);
    expect(state.headline).toBe('Lands in 2h');
    expect(state.countdownKind).toBe('arrival');
    expect(state.countdownEnd).toBe(Date.parse('2026-09-09T03:05Z'));
    expect(flightProgress(s, now)).toBeCloseTo(0.5, 2);
  });

  it('reads the timetable once the departure is gone with no stage recorded', () => {
    // Nothing tapped, nothing polled: half-way by the clocks.
    const halfway = Date.parse('2026-09-09T00:55Z');
    const aloft = buildContentState(session(), halfway);
    expect(aloft.headline).toBe('Due to land in 2h');
    expect(aloft.subtitle).toBe('Going by the timetable');
    expect(aloft.compactLabel).toBe('Timetable');
    expect(aloft.countdownKind).toBe('arrival');
    expect(aloft.countdownEnd).toBe(Date.parse('2026-09-09T03:05Z'));
    expect(flightProgress(session(), halfway)).toBeCloseTo(0.5, 2);
    // Past the due arrival: flown, no countdown, plane at the end.
    const after = Date.parse('2026-09-09T05:00Z');
    const flown = buildContentState(session(), after);
    expect(flown.headline).toBe('Flown');
    expect(flown.subtitle).toBe('Due to land 06:05 · going by the timetable');
    expect(flown.compactLabel).toBe('Flown');
    expect(flown.countdownKind).toBe('');
    expect(flightProgress(session(), after)).toBe(1);
    // A minute past take-off is still "now", not a presumption.
    expect(buildContentState(session(), Date.parse('2026-09-08T22:45:30Z')).headline).toBe('Departing now');
  });

  it('poll cadence reads the pinned departure — 10-minute polls around the real take-off', () => {
    const tenMinutesBefore = Date.parse('2026-09-08T22:35Z');
    expect(nextPollDelayMs(session(), tenMinutesBefore)).toBe(10 * 60_000);
  });
});

describe('buildContentState with a connecting leg\'s plan', () => {
  const PLAN = ['security', 'boarded', 'departed', 'landed', 'arrival_immigration', 'bags_collected'];
  const landedAt = '2026-09-09T03:00:00.000Z';

  it('walks the arrival steps after the landing and never calls a recorded stage "Flown"', () => {
    const now = Date.parse('2026-09-09T03:20Z');
    const landed = buildContentState(
      session({ plan: PLAN, currentStage: 'landed', stageTimes: { landed: landedAt } }),
      now,
    );
    expect(landed.headline).toBe('Landed');
    expect(landed.subtitle).toBe('Passport control');
    expect(landed.compactLabel).toBe('Passport');
    const through = buildContentState(
      session({
        plan: PLAN,
        currentStage: 'arrival_immigration',
        stageTimes: { landed: landedAt, arrival_immigration: '2026-09-09T03:15:00.000Z' },
        baggageBelt: '4',
      }),
      now,
    );
    expect(through.headline).toBe('Landed');
    expect(through.subtitle).toBe('Collect your bags · belt 4');
    expect(through.compactLabel).toBe('Belt 4');
    expect(through.progress).toBe(1);
    expect(through.countdownKind).toBe('');
    const done = buildContentState(
      session({
        plan: PLAN,
        currentStage: 'bags_collected',
        stageTimes: { landed: landedAt, bags_collected: '2026-09-09T03:19:00.000Z' },
      }),
      now,
    );
    expect(done.subtitle).toBe('Welcome to DOH');
    expect(done.stageLabel).toBe('Bags collected');
  });

  it('does not offer the arrival steps while the plane is still up, and starts at security', () => {
    const boarded = buildContentState(
      session({ plan: PLAN, currentStage: 'boarded', stageTimes: { boarded: '2026-09-08T22:00:00.000Z' } }),
      Date.parse('2026-09-08T22:10Z'),
    );
    expect(boarded.subtitle).toBe('On board · ready for pushback');
    const waiting = buildContentState(session({ plan: PLAN }), Date.parse('2026-09-08T20:00Z'));
    expect(waiting.subtitle).toBe('Head to security');
  });
});

describe('buildContentState marks a next-day landing', () => {
  it('appends "⁺¹" to the arrival clock when the landing reads on the next day', () => {
    // Doha 19:40 → Kochi 02:45 next morning (a QR516).
    const s = session({
      fromCode: 'DOH',
      toCode: 'COK',
      scheduledDeparture: '2026-08-02T16:40:00.000Z',
      scheduledArrival: '2026-08-02T21:15:00.000Z',
    });
    const state = buildContentState(s, Date.parse('2026-08-02T12:00Z'));
    expect(state.arrTime).toBe('02:45⁺¹');
    expect(state.depTime).toBe('19:40');
    // The manual COK → DOH row of the other tests lands the same day.
    expect(buildContentState(session(), Date.parse('2026-09-08T20:00Z')).arrTime).toBe('06:05');
  });
});

describe('shouldStartActivity (server push-to-start)', () => {
  const dep = Date.parse('2026-09-08T22:45Z'); // pinned COK 04:15
  const fresh = (over: Partial<Doc<'liveSessions'>> = {}) =>
    session({ activityId: null, activityStartedAt: null, ...over });

  it('waits for the live window (T−4h) and stops an hour past landing', () => {
    expect(shouldStartActivity(fresh(), dep - 5 * 3_600_000)).toBe(false);
    expect(shouldStartActivity(fresh(), dep - 4 * 3_600_000)).toBe(true);
    const arr = Date.parse('2026-09-09T03:05Z');
    expect(shouldStartActivity(fresh(), arr + 30 * 60_000)).toBe(true);
    expect(shouldStartActivity(fresh(), arr + 2 * 3_600_000)).toBe(false);
    expect(shouldStartActivity(fresh({ currentStage: 'landed' }), dep + 60_000)).toBe(false);
  });

  it('restarts a known activity only once it has outlived the eight-hour cap', () => {
    const startedAt = new Date(dep - 4 * 3_600_000).toISOString();
    const s = fresh({ activityId: 'x~abc', activityStartedAt: startedAt });
    expect(shouldStartActivity(s, dep)).toBe(false);
    expect(shouldStartActivity(s, dep - 4 * 3_600_000 + ACTIVITY_LIFETIME_MS)).toBe(true);
  });

  it('leaves legacy rows (id, no stamp) to the device', () => {
    expect(shouldStartActivity(fresh({ activityId: 'x~abc' }), dep)).toBe(false);
  });

  it('retries a failed start at most once per lifetime', () => {
    const attempted = new Date(dep - 4 * 3_600_000).toISOString();
    const s = fresh({ activityStartedAt: attempted });
    expect(shouldStartActivity(s, dep - 3 * 3_600_000)).toBe(false);
    expect(shouldStartActivity(s, dep - 4 * 3_600_000 + ACTIVITY_LIFETIME_MS)).toBe(true);
  });
});

describe('liveUntil', () => {
  // The same rule stillLive applies, as the deadline the client is handed —
  // so the policy lives here and the client only watches the clock.
  const at = (iso: string) => Date.parse(iso);

  it('is twelve hours past a recorded landing', () => {
    const landed = session({ currentStage: 'landed', stageTimes: { landed: '2026-09-09T03:30:00.000Z' } });
    expect(liveUntil(landed)).toBe(at('2026-09-09T15:30:00.000Z'));
  });

  it("falls back to the airline's arrival, then the timetable's", () => {
    const reported = session({ currentStage: 'landed', stageTimes: {}, actualArrival: '2026-09-09T03:00:00.000Z' });
    expect(liveUntil(reported)).toBe(at('2026-09-09T15:00:00.000Z'));
    // Nothing recorded at all: due 06:05 in Doha = 03:05Z.
    expect(liveUntil(session())).toBe(at('2026-09-09T03:05:00.000Z') + 12 * 3_600_000);
  });

  it('holds while a connecting leg is still to leave', () => {
    const onward = [{ scheduledDeparture: '2026-09-09T18:00:00.000Z', fromCode: 'DOH' }];
    expect(liveUntil(session(), onward)).toBe(at('2026-09-09T18:00:00.000Z'));
    // ...but never shortens the landing window when the leg leaves sooner.
    expect(liveUntil(session(), [{ scheduledDeparture: '2026-09-09T05:00:00.000Z', fromCode: 'DOH' }])).toBe(
      at('2026-09-09T15:05:00.000Z'),
    );
  });

  it('never outlives the session itself', () => {
    // A take-off with no landing behind it never reads as flown, so only the
    // session's own expiry ends it.
    const aloft = session({ currentStage: 'departed', stageTimes: { departed: '2026-09-09T00:00:00.000Z' } });
    expect(liveUntil(aloft)).toBe(at('2026-09-11T06:05:00.000Z'));
    // And a distant onward leg cannot push past it either.
    expect(liveUntil(session(), [{ scheduledDeparture: '2026-09-20T00:00:00.000Z', fromCode: 'DOH' }])).toBe(
      at('2026-09-11T06:05:00.000Z'),
    );
  });

  it('agrees with stillLive on either side of the deadline', () => {
    const landed = session({ currentStage: 'landed', stageTimes: { landed: '2026-09-09T03:30:00.000Z' } });
    const deadline = liveUntil(landed);
    expect(stillLive(landed, deadline - 60_000)).toBe(true);
    expect(stillLive(landed, deadline + 60_000)).toBe(false);
  });
});

describe('preferredSession', () => {
  // Shanavas's 2026-09-19 connection, as a follower's home screen saw it at
  // 05:05Z the next morning: HEL→DOH landed 13:35Z, DOH→COK landed 21:15Z,
  // both sessions still active. The second landing is the one that is still
  // news; the first is yesterday.
  const hel = session({
    number: 'QR304',
    fromCode: 'HEL',
    toCode: 'DOH',
    scheduledDeparture: '2026-09-19T06:50:00.000Z',
    currentStage: 'landed',
    stageTimes: { landed: '2026-09-19T13:35:59.329Z' },
  });
  const doh = session({
    number: 'QR516',
    fromCode: 'DOH',
    toCode: 'COK',
    scheduledDeparture: '2026-09-19T16:40Z',
    scheduledArrival: '2026-09-19T21:15Z',
    currentStage: 'landed',
    stageTimes: { landed: '2026-09-19T21:15Z' },
  });

  it('shows the latest leg once both are down, not the first', () => {
    expect(preferredSession([hel, doh])?.number).toBe('QR516');
    expect(preferredSession([doh, hel])?.number).toBe('QR516');
  });

  it('keeps the traveller on a follower surface while the last landing is fresh', () => {
    // The caller tests stillLive on the CHOSEN session only, so picking the
    // stale leg drops the traveller entirely.
    const now = Date.parse('2026-09-20T05:05Z');
    expect(stillLive(hel, now)).toBe(false);
    expect(stillLive(doh, now)).toBe(true);
    expect(stillLive(preferredSession([hel, doh])!, now)).toBe(true);
  });

  it('still prefers a leg that has not landed, and the soonest of those', () => {
    const boarding = session({ number: 'QR517', scheduledDeparture: '2026-09-19T20:00Z', currentStage: 'boarded' });
    expect(preferredSession([hel, boarding])?.number).toBe('QR517');
    const later = session({ number: 'QR9', scheduledDeparture: '2026-09-19T22:00Z', currentStage: null });
    expect(preferredSession([later, boarding])?.number).toBe('QR517');
  });

  it('treats an arrival step as down, not as still going', () => {
    // bags_collected is on the ground; a leg actually in the air outranks it.
    const bags = session({ number: 'QR1', scheduledDeparture: '2026-09-19T06:00Z', currentStage: 'bags_collected' });
    const flying = session({ number: 'QR2', scheduledDeparture: '2026-09-19T12:00Z', currentStage: 'departed' });
    expect(preferredSession([bags, flying])?.number).toBe('QR2');
  });
});

describe('stillLive', () => {
  // Due to land 06:05 in Doha = 03:05Z.
  it('keeps a trip live until twelve hours after it lands, recorded or by the timetable', () => {
    expect(stillLive(session(), Date.parse('2026-09-09T00:00Z'))).toBe(true);
    // Nothing recorded: the timetable arrival (03:05Z) starts the clock.
    expect(stillLive(session(), Date.parse('2026-09-09T14:55Z'))).toBe(true);
    expect(stillLive(session(), Date.parse('2026-09-09T15:10Z'))).toBe(false);
    // A recorded landing starts it from the stamp instead.
    const landed = session({ currentStage: 'landed', stageTimes: { landed: '2026-09-09T03:30:00.000Z' } });
    expect(stillLive(landed, Date.parse('2026-09-09T15:20Z'))).toBe(true);
    expect(stillLive(landed, Date.parse('2026-09-09T15:40Z'))).toBe(false);
  });
  it('stays live while a connecting leg is still to leave', () => {
    // Past the twelve hours the landing alone would have bought (arrival
    // 03:05Z), so only the onward leg can be keeping it live.
    expect(
      stillLive(session(), Date.parse('2026-09-09T16:00Z'), [
        { scheduledDeparture: '2026-09-09T16:00:00.000Z', fromCode: 'DOH' },
      ]),
    ).toBe(false);
    expect(
      stillLive(session(), Date.parse('2026-09-09T16:00Z'), [
        { scheduledDeparture: '2026-09-09T18:00:00.000Z', fromCode: 'DOH' },
      ]),
    ).toBe(true);
  });
});

describe('sessionExpiryFor', () => {
  it('pins a bare arrival clock to its airport', () => {
    const now = Date.parse('2026-09-08T12:00Z');
    expect(sessionExpiryFor('2026-09-09T06:05:00', now, 'DOH')).toBe(
      Date.parse('2026-09-09T03:05Z') + 48 * 3_600_000,
    );
  });
});

describe('liveLead', () => {
  const base = {
    stage: null,
    presumed: null,
    boardingOpen: false,
    delayMinutes: null,
    gate: '53',
    terminal: '2',
    checkInDesk: 'A200',
    baggageBelt: '7',
    seat: '14A',
    boardingClock: '15:30',
    departureClock: '16:00',
    ticketedDepartureClock: '15:14',
    landedClock: '17:08',
  } satisfies LiveLeadInput;

  it('leads with the terminal on the way, the desk at the airport, the gate from check-in', () => {
    expect(liveLead(base)).toMatchObject({ clockLabel: 'DEPARTS IN', lead: { label: 'TERMINAL', value: '2' }, compact: 'T2' });
    expect(liveLead({ ...base, stage: 'at_airport' })).toMatchObject({
      lead: { label: 'CHECK-IN', value: 'A200', sub: 'Terminal 2' },
      compact: 'T2',
    });
    for (const stage of ['checked_in', 'bag_dropped', 'security', 'immigration']) {
      expect(liveLead({ ...base, stage })).toMatchObject({
        lead: { label: 'GATE', value: '53', sub: 'Boards 15:30' },
        compact: 'G53',
      });
    }
  });

  it('says the gate is not posted yet rather than leading with nothing', () => {
    expect(liveLead({ ...base, stage: 'security', gate: null })).toMatchObject({
      lead: { label: 'GATE', value: '—', sub: 'Not posted yet' },
      compact: 'Gate —',
    });
  });

  it('turns green for boarding, then the seat leads on board and in the air', () => {
    expect(liveLead({ ...base, stage: 'security', boardingOpen: true })).toMatchObject({
      clockLabel: 'BOARDING',
      tone: 'boarding',
      lead: { label: 'GATE', value: '53', sub: 'Departs 16:00' },
    });
    expect(liveLead({ ...base, stage: 'boarded' })).toMatchObject({ lead: { label: 'SEAT', value: '14A' }, compact: '14A' });
    expect(liveLead({ ...base, stage: 'departed' })).toMatchObject({ clockLabel: 'LANDS IN', lead: { label: 'SEAT' } });
    // A follower's card carries no seat: the clock stands alone.
    expect(liveLead({ ...base, stage: 'departed', seat: null })).toMatchObject({ lead: null, compact: '' });
  });

  it('goes amber with a chip when half an hour late', () => {
    expect(liveLead({ ...base, stage: 'checked_in', delayMinutes: 46, boardingClock: null })).toMatchObject({
      tone: 'delay',
      delayChip: '+46 min',
      lead: { sub: 'Was 15:14' },
    });
    expect(liveLead({ ...base, delayMinutes: 20 }).tone).toBe('normal');
    expect(liveLead({ ...base, delayMinutes: 125 }).delayChip).toBe('+2h 5 min');
  });

  it('ends on the belt once landed, by the timetable too', () => {
    expect(liveLead({ ...base, stage: 'landed' })).toMatchObject({
      clockLabel: 'LANDED 17:08',
      tone: 'landed',
      lead: { label: 'BAGGAGE', value: 'Belt 7' },
      compact: 'Belt 7',
    });
    expect(liveLead({ ...base, presumed: 'landed', landedClock: null }).clockLabel).toBe('LANDED');
  });
});

describe('heldOnGround / presumedFlightStage', () => {
  const now = Date.parse('2026-09-19T17:00:00Z');
  const dep = Date.parse('2026-09-19T16:40:00Z');
  const arr = Date.parse('2026-09-19T21:03:00Z');

  it('a fresh check with no take-off holds the flight at the gate', () => {
    const held = heldOnGround({ currentStage: null, actualDeparture: null, lastCheckedAt: '2026-09-19T16:55:00Z' }, now);
    expect(held).toBe(true);
    expect(presumedFlightStage(null, dep, arr, now, held)).toBeNull();
  });

  it('a stale check, a reported take-off or no check at all lets the timetable decide', () => {
    expect(heldOnGround({ currentStage: null, lastCheckedAt: '2026-09-19T16:30:00Z' }, now)).toBe(false);
    expect(heldOnGround({ currentStage: null, actualDeparture: '2026-09-19T16:58Z', lastCheckedAt: '2026-09-19T16:59:00Z' }, now)).toBe(false);
    expect(heldOnGround({ currentStage: null, lastCheckedAt: null }, now)).toBe(false);
    expect(presumedFlightStage(null, dep, arr, now)).toBe('departed');
  });
});
