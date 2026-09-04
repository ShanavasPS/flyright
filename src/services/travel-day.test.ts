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
  flightProgress,
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

  it('skips a landed flight so it cannot shadow a later live trip', () => {
    // Both flights are in-window on paper at 11:00Z; the morning one landed
    // at 10:00Z, so its real window closed at 10:30Z.
    const morning = journey({
      id: 'AY1331',
      scheduledDeparture: '2026-08-25T05:00Z',
      scheduledArrival: '2026-08-25T08:10Z',
    });
    const afternoon = journey({
      id: 'AY815',
      scheduledDeparture: '2026-08-25T12:00Z',
      scheduledArrival: '2026-08-25T13:00Z',
    });
    const landed: TravelDayState = { stage: 'landed', stamps: { landed: '2026-08-25T10:00Z' } };
    const stateOf = (id: string) => (id === morning.id ? landed : EMPTY_TRAVEL_DAY);
    const at = new Date('2026-08-25T11:00Z');

    // Without real state the landed flight wins on departure time — the bug.
    expect(activeJourney([morning, afternoon], at)?.id).toBe(morning.id);
    // With it, the genuinely live afternoon trip surfaces.
    expect(activeJourney([morning, afternoon], at, stateOf)?.id).toBe(afternoon.id);
  });
});

describe('liveContent', () => {
  const liveNow = new Date('2026-08-25T05:00Z'); // T−3h

  it('heads with the countdown before any stage; the subtitle never repeats it', () => {
    const c = liveContent(journey(), EMPTY_TRAVEL_DAY, EMPTY_FACTS, liveNow);
    expect(c.title).toBe('AY123 · HEL → LHR');
    expect(c.headline).toBe('Flight in 3h');
    // Inside the live window (T−4h) the airport is the next step…
    expect(c.subtitle).toBe('Head to the airport');
    expect(c.progress).toBe(0);
    expect(c.emphasis).toBe('none');
    // …the evening before, honesty beats a premature nudge.
    const eveBefore = liveContent(journey(), EMPTY_TRAVEL_DAY, EMPTY_FACTS, new Date('2026-08-24T14:00Z'));
    expect(eveBefore.headline).toBe('Flight in 18h');
    expect(eveBefore.subtitle).toBe('Nothing to do yet');
    // Minutes once under 90; "Departing now" at the scheduled time.
    expect(
      liveContent(journey(), EMPTY_TRAVEL_DAY, EMPTY_FACTS, new Date('2026-08-25T07:15Z')).headline,
    ).toBe('Flight in 45 min');
    expect(
      liveContent(journey(), EMPTY_TRAVEL_DAY, EMPTY_FACTS, new Date('2026-08-25T08:00Z')).headline,
    ).toBe('Departing now');
  });

  it('headline counts to the estimated departure when the airline posts one', () => {
    const c = liveContent(
      journey(),
      EMPTY_TRAVEL_DAY,
      facts({ delayMinutes: 60, estimatedDeparture: '2026-08-25T09:00Z' }),
      liveNow,
    );
    expect(c.headline).toBe('Flight in 4h');
    expect(c.delayLabel).toBe('1h late');
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

  it('progress is flight progress: parked until take-off, time-based aloft, full on landing', () => {
    // The whole airport walk leaves the plane at the origin.
    let state = EMPTY_TRAVEL_DAY;
    for (const stage of STAGE_ORDER.slice(0, 6)) {
      state = advance(state, stage, liveNow);
      expect(liveContent(journey(), state, EMPTY_FACTS, liveNow).progress).toBe(0);
    }
    // Departed 08:05, estimated arrival 10:45 → at 09:25 half-way.
    const inAir = applyFlightFacts(state, facts({ actualDeparture: '2026-08-25T08:05Z' }));
    const aloft = facts({
      actualDeparture: '2026-08-25T08:05Z',
      estimatedArrival: '2026-08-25T10:45Z',
    });
    expect(flightProgress(journey(), inAir, aloft, new Date('2026-08-25T09:25Z'))).toBeCloseTo(0.5);
    // Just after departure it has visibly left; before landing it hasn't arrived.
    expect(flightProgress(journey(), inAir, aloft, new Date('2026-08-25T08:05Z'))).toBe(0.03);
    expect(flightProgress(journey(), inAir, aloft, new Date('2026-08-25T12:00Z'))).toBe(0.97);
    // The scheduled arrival stands in when no estimate exists (10:35).
    expect(
      flightProgress(journey(), inAir, facts({ actualDeparture: '2026-08-25T08:05Z' }), new Date('2026-08-25T09:20Z')),
    ).toBeCloseTo(0.5);
    // A manual trip's own take-off stamp anchors the start.
    const manualAir = advance(
      advance(EMPTY_TRAVEL_DAY, 'boarded', liveNow, true),
      'departed',
      new Date('2026-08-25T08:00Z'),
      true,
    );
    expect(
      flightProgress(journey({ source: 'manual' }), manualAir, EMPTY_FACTS, new Date('2026-08-25T09:17:30Z')),
    ).toBeCloseTo(0.5);
    const landed = applyFlightFacts(inAir, facts({ actualArrival: '2026-08-25T10:50Z' }));
    expect(liveContent(journey(), landed, EMPTY_FACTS, liveNow).progress).toBe(1);
  });

  it('compactLabel: departure clock → next step → gate code → stage word', () => {
    // No stage: the scheduled departure clock (stable, useful).
    const before = liveContent(journey(), EMPTY_TRAVEL_DAY, EMPTY_FACTS, liveNow);
    expect(before.compactLabel).toBe(formatTime('2026-08-25T08:00Z'));

    // Once the walk starts, the slot names the NEXT step, not the last one —
    // and a posted gate waits until the gate is where you're headed.
    const atAirport = advance(EMPTY_TRAVEL_DAY, 'at_airport', liveNow);
    expect(liveContent(journey(), atAirport, facts({ gate: '24' }), liveNow).compactLabel).toBe(
      'Check in',
    );
    const throughSecurity = advance(atAirport, 'security', liveNow);
    expect(liveContent(journey(), throughSecurity, EMPTY_FACTS, liveNow).compactLabel).toBe(
      'Passport',
    );
    const throughImmigration = advance(throughSecurity, 'immigration', liveNow);
    expect(
      liveContent(journey(), throughImmigration, facts({ gate: '24' }), liveNow).compactLabel,
    ).toBe('G24');
    expect(liveContent(journey(), throughImmigration, EMPTY_FACTS, liveNow).compactLabel).toBe(
      'Gate',
    );

    // From boarded on, the stage word wins even with a gate posted.
    const boarded = advance(throughImmigration, 'boarded', liveNow);
    expect(liveContent(journey(), boarded, facts({ gate: '24' }), liveNow).compactLabel).toBe(
      'Boarded',
    );
    const landed = applyFlightFacts(boarded, facts({ actualArrival: '2026-08-25T10:50Z' }));
    expect(liveContent(journey(), landed, EMPTY_FACTS, liveNow).compactLabel).toBe('Landed');
    expect(liveContent(journey(), landed, facts({ baggageBelt: '7' }), liveNow).compactLabel).toBe(
      'Belt 7',
    );
  });

  it('subtitle tells the traveler the next step, never the finished one', () => {
    const atAirport = advance(EMPTY_TRAVEL_DAY, 'at_airport', liveNow);
    expect(liveContent(journey(), atAirport, EMPTY_FACTS, liveNow).subtitle).toBe('Check in');
    expect(liveContent(journey(), atAirport, facts({ checkInDesk: '214' }), liveNow).subtitle).toBe(
      'Check in at desk 214',
    );
    const checkedIn = advance(atAirport, 'checked_in', liveNow);
    expect(liveContent(journey(), checkedIn, EMPTY_FACTS, liveNow).subtitle).toBe('Drop your bags');
    // Skipping bag drop is normal — the next step simply moves on.
    const throughSecurity = advance(checkedIn, 'security', liveNow);
    expect(liveContent(journey(), throughSecurity, EMPTY_FACTS, liveNow).subtitle).toBe(
      'Passport control',
    );
    const throughImmigration = advance(throughSecurity, 'immigration', liveNow);
    expect(liveContent(journey(), throughImmigration, EMPTY_FACTS, liveNow).subtitle).toBe(
      'Go to your gate',
    );
    expect(
      liveContent(
        journey(),
        throughImmigration,
        facts({ gate: 'A12', boardingTime: '2026-08-25T07:30Z' }),
        liveNow,
      ).subtitle,
    ).toBe(`Go to gate A12 · boards ${formatTime('2026-08-25T07:30Z')}`);
    // Boarding open: the gate is the task wherever the walk stands.
    expect(
      liveContent(
        journey(),
        checkedIn,
        facts({ gate: 'A12', boardingTime: '2026-08-25T04:50Z' }),
        liveNow,
      ).subtitle,
    ).toBe('Boarding now · Gate A12');
    const boarded = advance(throughImmigration, 'boarded', liveNow);
    expect(liveContent(journey(), boarded, EMPTY_FACTS, liveNow).subtitle).toBe(
      'On board · ready for pushback',
    );
  });

  it('manual trips walk the next step through take-off', () => {
    const manual = journey({ source: 'manual', number: '' });
    const boarded = advance(EMPTY_TRAVEL_DAY, 'boarded', liveNow, true);
    expect(liveContent(manual, boarded, EMPTY_FACTS, liveNow).subtitle).toBe(
      'On board · ready for pushback',
    );
    const departed = advance(boarded, 'departed', liveNow, true);
    expect(liveContent(manual, departed, EMPTY_FACTS, liveNow).compactLabel).toBe('In air');
  });

  it('reflects in-air and landed states', () => {
    const inAir = applyFlightFacts(
      EMPTY_TRAVEL_DAY,
      facts({ actualDeparture: '2026-08-25T08:05Z' }),
    );
    const aloft = liveContent(
      journey(),
      inAir,
      facts({ actualDeparture: '2026-08-25T08:05Z', estimatedArrival: '2026-08-25T10:50Z' }),
      new Date('2026-08-25T10:10Z'),
    );
    expect(aloft.headline).toBe('Lands in 40 min');
    expect(aloft.subtitle).toBe('In the air');
    const landed = applyFlightFacts(inAir, facts({ actualArrival: '2026-08-25T10:50Z' }));
    const down = liveContent(journey(), landed, EMPTY_FACTS, liveNow);
    expect(down.headline).toBe('Landed');
    expect(down.subtitle).toBe('Welcome to LHR');
    expect(liveContent(journey(), landed, facts({ baggageBelt: '7' }), liveNow).subtitle).toBe(
      'Bags at belt 7',
    );
  });
});
