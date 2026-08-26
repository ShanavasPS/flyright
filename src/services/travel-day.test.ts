import { formatTime } from '@/services/dates';
import {
  EMPTY_FACTS,
  EMPTY_TRAVEL_DAY,
  STAGE_ORDER,
  activeJourney,
  advance,
  applyFlightFacts,
  canAdvanceTo,
  canRewindTo,
  liveContent,
  rewindTo,
  travelWindow,
  undoLast,
  type FlightFacts,
  type TravelDayState,
  type TravelJourney,
} from '@/services/travel-day';

const NOW = new Date('2026-08-24T12:00:00Z');

function journey(overrides: Partial<TravelJourney> = {}): TravelJourney {
  return {
    id: 'AY123-2026-08-25',
    mode: 'flight',
    source: 'lookup',
    number: 'AY123',
    carrier: 'Finnair',
    fromCode: 'HEL',
    toCode: 'LHR',
    scheduledDeparture: '2026-08-25T08:00Z',
    scheduledArrival: '2026-08-25T10:35Z',
    ...overrides,
  };
}

const facts = (overrides: Partial<FlightFacts> = {}): FlightFacts => ({
  ...EMPTY_FACTS,
  ...overrides,
});

describe('advance / canAdvanceTo', () => {
  it('moves forward and stamps the stage', () => {
    const state = advance(EMPTY_TRAVEL_DAY, 'at_airport', NOW);
    expect(state.stage).toBe('at_airport');
    expect(state.stamps.at_airport).toBe(NOW.toISOString());
  });

  it('allows skipping stages', () => {
    const state = advance(EMPTY_TRAVEL_DAY, 'security', NOW);
    expect(state.stage).toBe('security');
    expect(state.stamps.at_airport).toBeUndefined();
  });

  it('rejects moving backwards or re-tapping the current stage', () => {
    const state = advance(EMPTY_TRAVEL_DAY, 'security', NOW);
    expect(canAdvanceTo(state, 'at_airport')).toBe(false);
    expect(canAdvanceTo(state, 'security')).toBe(false);
    expect(advance(state, 'at_airport', NOW)).toBe(state);
  });

  it('never lets a tap reach flight-driven stages on tracked flights', () => {
    const state = advance(EMPTY_TRAVEL_DAY, 'boarded', NOW);
    expect(canAdvanceTo(state, 'departed' as never)).toBe(false);
    expect(advance(state, 'landed' as never, NOW)).toBe(state);
  });

  it('manual trips may tap departed and landed (no status feed to do it)', () => {
    let state = advance(EMPTY_TRAVEL_DAY, 'boarded', NOW);
    expect(canAdvanceTo(state, 'departed', true)).toBe(true);
    state = advance(state, 'departed', NOW, true);
    state = advance(state, 'landed', NOW, true);
    expect(state.stage).toBe('landed');
    expect(state.stamps.landed).toBe(NOW.toISOString());
  });
});

describe('undoLast', () => {
  it('reverts only the most recent traveler stamp', () => {
    let state = advance(EMPTY_TRAVEL_DAY, 'checked_in', NOW);
    state = advance(state, 'security', NOW);
    const undone = undoLast(state);
    expect(undone.stage).toBe('checked_in');
    expect(undone.stamps.security).toBeUndefined();
    expect(undone.stamps.checked_in).toBeDefined();
  });

  it('returns to null from the first stamp', () => {
    const state = advance(EMPTY_TRAVEL_DAY, 'at_airport', NOW);
    expect(undoLast(state).stage).toBeNull();
  });

  it('cannot undo a flight-driven stage on tracked flights', () => {
    const departed: TravelDayState = {
      stage: 'departed',
      stamps: { boarded: NOW.toISOString(), departed: NOW.toISOString() },
    };
    expect(undoLast(departed)).toBe(departed);
    // Manual trips own every stamp, so the undo works there.
    expect(undoLast(departed, true).stage).toBe('boarded');
  });
});

describe('rewindTo / canRewindTo', () => {
  const walk = (): TravelDayState => {
    let state = advance(EMPTY_TRAVEL_DAY, 'at_airport', NOW);
    state = advance(state, 'checked_in', NOW);
    state = advance(state, 'security', NOW);
    return state;
  };

  it('slides back multiple stages, dropping the stamps after the target', () => {
    const state = rewindTo(walk(), 'at_airport');
    expect(state.stage).toBe('at_airport');
    expect(state.stamps.at_airport).toBeDefined();
    expect(state.stamps.checked_in).toBeUndefined();
    expect(state.stamps.security).toBeUndefined();
  });

  it('keeps stamps up to and including the target', () => {
    const state = rewindTo(walk(), 'checked_in');
    expect(state.stage).toBe('checked_in');
    expect(state.stamps.at_airport).toBeDefined();
    expect(state.stamps.checked_in).toBeDefined();
    expect(state.stamps.security).toBeUndefined();
  });

  it('rejects unstamped (skipped) stages and forward targets', () => {
    const state = walk(); // bag_dropped was skipped
    expect(canRewindTo(state, 'bag_dropped')).toBe(false);
    expect(canRewindTo(state, 'boarded')).toBe(false);
    expect(canRewindTo(state, 'security')).toBe(false);
    expect(rewindTo(state, 'boarded')).toBe(state);
  });

  it('is off-limits once the flight has departed — unless the trip is manual', () => {
    const departed: TravelDayState = {
      stage: 'departed',
      stamps: { at_airport: NOW.toISOString(), departed: NOW.toISOString() },
    };
    expect(canRewindTo(departed, 'at_airport')).toBe(false);
    expect(rewindTo(departed, 'at_airport')).toBe(departed);
    const rewound = rewindTo(departed, 'at_airport', true);
    expect(rewound.stage).toBe('at_airport');
    expect(rewound.stamps.departed).toBeUndefined();
  });
});

describe('applyFlightFacts', () => {
  it('promotes to departed and landed from actual times', () => {
    const dep = applyFlightFacts(EMPTY_TRAVEL_DAY, facts({ actualDeparture: '2026-08-25T08:10Z' }));
    expect(dep.stage).toBe('departed');
    const landed = applyFlightFacts(dep, facts({ actualArrival: '2026-08-25T10:40Z' }));
    expect(landed.stage).toBe('landed');
    expect(landed.stamps.landed).toBe('2026-08-25T10:40Z');
  });

  it('overrides a lagging traveler stage but keeps its stamps', () => {
    const state = advance(EMPTY_TRAVEL_DAY, 'security', NOW);
    const next = applyFlightFacts(state, facts({ actualDeparture: '2026-08-25T08:10Z' }));
    expect(next.stage).toBe('departed');
    expect(next.stamps.security).toBeDefined();
  });

  it('never regresses on missing facts', () => {
    const landed = applyFlightFacts(
      EMPTY_TRAVEL_DAY,
      facts({ actualArrival: '2026-08-25T10:40Z' }),
    );
    expect(applyFlightFacts(landed, EMPTY_FACTS)).toEqual(landed);
  });
});

describe('travelWindow', () => {
  it('is unsupported for non-flight modes and fabricated noon times', () => {
    expect(travelWindow(journey({ mode: 'train' }), EMPTY_TRAVEL_DAY, NOW).phase).toBe(
      'unsupported',
    );
    const noon = journey({
      source: 'manual',
      scheduledDeparture: '2026-08-25T12:00:00',
      scheduledArrival: '2026-08-25T12:00:00',
    });
    expect(travelWindow(noon, EMPTY_TRAVEL_DAY, NOW).phase).toBe('unsupported');
  });

  it('supports manual rows with real times (no facts, but a timeline)', () => {
    const manual = journey({
      source: 'manual',
      scheduledDeparture: '2026-08-25T08:00:00',
      scheduledArrival: '2026-08-25T10:35:00',
    });
    expect(travelWindow(manual, EMPTY_TRAVEL_DAY, NOW).phase).not.toBe('unsupported');
  });

  it('walks before → reminder → live → ended', () => {
    const j = journey(); // departs 2026-08-25T08:00Z
    const at = (iso: string) => travelWindow(j, EMPTY_TRAVEL_DAY, new Date(iso)).phase;
    expect(at('2026-08-24T07:00Z')).toBe('before');
    expect(at('2026-08-24T09:00Z')).toBe('reminder'); // T−23h
    expect(at('2026-08-25T05:00Z')).toBe('live'); // T−3h
    expect(at('2026-08-25T20:00Z')).toBe('ended'); // arrival+6h passed
  });

  it('ends 30 min after a landed stamp', () => {
    const j = journey();
    const state: TravelDayState = { stage: 'landed', stamps: { landed: '2026-08-25T10:40Z' } };
    expect(travelWindow(j, state, new Date('2026-08-25T11:00Z')).phase).toBe('live');
    expect(travelWindow(j, state, new Date('2026-08-25T11:20Z')).phase).toBe('ended');
  });

  it('hard-caps at departure+36h even without a landing', () => {
    const j = journey({ scheduledArrival: '2026-08-27T08:00Z' }); // absurd arrival
    expect(travelWindow(j, EMPTY_TRAVEL_DAY, new Date('2026-08-26T21:00Z')).phase).toBe('ended');
  });

  it('is unsupported on unparseable departures', () => {
    expect(
      travelWindow(journey({ scheduledDeparture: 'garbage' }), EMPTY_TRAVEL_DAY, NOW).phase,
    ).toBe('unsupported');
  });
});

describe('activeJourney', () => {
  it('picks the soonest in-window flight and ignores the rest', () => {
    const tomorrow = journey();
    const later = journey({ id: 'BA456', scheduledDeparture: '2026-08-25T10:00Z' });
    const nextWeek = journey({ id: 'DY7', scheduledDeparture: '2026-08-30T08:00Z' });
    const train = journey({ id: 'T1', mode: 'train' });
    expect(activeJourney([nextWeek, later, train, tomorrow], NOW)?.id).toBe(tomorrow.id);
    expect(activeJourney([nextWeek, train], NOW)).toBeNull();
  });
});

describe('liveContent', () => {
  const liveNow = new Date('2026-08-25T05:00Z'); // T−3h

  it('renders the countdown before any stage', () => {
    const c = liveContent(journey(), EMPTY_TRAVEL_DAY, EMPTY_FACTS, liveNow);
    expect(c.title).toBe('AY123 · HEL → LHR');
    expect(c.subtitle).toContain('Departs');
    expect(c.subtitle).toContain('in 3h');
    expect(c.progress).toBe(0);
    expect(c.emphasis).toBe('none');
  });

  it('leads with the delay and flags emphasis', () => {
    const c = liveContent(
      journey(),
      EMPTY_TRAVEL_DAY,
      facts({ delayMinutes: 95, gate: '24' }),
      liveNow,
    );
    expect(c.subtitle.startsWith('1h 35m late')).toBe(true);
    expect(c.emphasis).toBe('delay');
    expect(c.gate).toBe('24');
  });

  it('progress is monotonic across the stage walk', () => {
    let state = EMPTY_TRAVEL_DAY;
    let last = -1;
    for (const stage of STAGE_ORDER.slice(0, 6)) {
      state = advance(state, stage, liveNow);
      const { progress } = liveContent(journey(), state, EMPTY_FACTS, liveNow);
      expect(progress).toBeGreaterThan(last);
      last = progress;
    }
    expect(last).toBeLessThanOrEqual(1);
  });

  it('compactLabel: departure clock → gate → stage word once boarded', () => {
    // No stage, no gate: the scheduled departure clock (stable, useful).
    const before = liveContent(journey(), EMPTY_TRAVEL_DAY, EMPTY_FACTS, liveNow);
    expect(before.compactLabel).toBe(formatTime('2026-08-25T08:00Z'));

    // Gate outranks the walk until boarding — it's where you're headed.
    const atAirport = advance(EMPTY_TRAVEL_DAY, 'security', liveNow);
    expect(liveContent(journey(), atAirport, facts({ gate: '24' }), liveNow).compactLabel).toBe(
      'G24',
    );
    expect(liveContent(journey(), atAirport, EMPTY_FACTS, liveNow).compactLabel).toBe('Security');

    // From boarded on, the stage word wins even with a gate posted.
    const boarded = advance(atAirport, 'boarded', liveNow);
    expect(liveContent(journey(), boarded, facts({ gate: '24' }), liveNow).compactLabel).toBe(
      'Boarded',
    );
    const landed = applyFlightFacts(boarded, facts({ actualArrival: '2026-08-25T10:50Z' }));
    expect(liveContent(journey(), landed, EMPTY_FACTS, liveNow).compactLabel).toBe('Landed');
  });

  it('reflects in-air and landed states', () => {
    const inAir = applyFlightFacts(
      EMPTY_TRAVEL_DAY,
      facts({ actualDeparture: '2026-08-25T08:05Z' }),
    );
    expect(
      liveContent(journey(), inAir, facts({ estimatedArrival: '2026-08-25T10:50Z' }), liveNow)
        .subtitle,
    ).toContain('In the air');
    const landed = applyFlightFacts(inAir, facts({ actualArrival: '2026-08-25T10:50Z' }));
    expect(liveContent(journey(), landed, EMPTY_FACTS, liveNow).subtitle).toBe('Landed in LHR');
  });
});
