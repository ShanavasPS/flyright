import { flightInstant } from '../../convex/airportZones';
import {
  ACTIVITY_LIFETIME_MS,
  buildContentState,
  flightProgress,
  liveCountdown,
  nextPollDelayMs,
  sessionExpiryFor,
  shouldStartActivity,
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

describe('sessionExpiryFor', () => {
  it('pins a bare arrival clock to its airport', () => {
    const now = Date.parse('2026-09-08T12:00Z');
    expect(sessionExpiryFor('2026-09-09T06:05:00', now, 'DOH')).toBe(
      Date.parse('2026-09-09T03:05Z') + 48 * 3_600_000,
    );
  });
});
