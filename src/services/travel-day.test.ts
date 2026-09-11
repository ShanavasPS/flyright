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
  nextStage,
  rewindTo,
  stagePlan,
  travelWindow,
  undoLast,
  type FlightFacts,
  type TravelDayState,
  type TravelJourney,
} from '@/services/travel-day';

const NOW = new Date('2026-08-24T12:00:00Z');
const MANUAL = { manualTrip: true };

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
    expect(canAdvanceTo(state, 'departed', MANUAL)).toBe(true);
    state = advance(state, 'departed', NOW, MANUAL);
    state = advance(state, 'landed', NOW, MANUAL);
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
    expect(undoLast(departed, MANUAL).stage).toBe('boarded');
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
    const rewound = rewindTo(departed, 'at_airport', MANUAL);
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

  it('reads the timetable once the departure is gone with nothing recorded', () => {
    // A manual trip whose "Departed" was never tapped: no more "Departing
    // now" through the flight; the plane and the countdown follow the clocks.
    const manual = journey({ source: 'manual', number: '' });
    const aloft = liveContent(manual, EMPTY_TRAVEL_DAY, EMPTY_FACTS, new Date('2026-08-25T09:17:30Z'));
    expect(aloft.headline).toBe('Due to land in 78 min');
    expect(aloft.subtitle).toBe('Going by the timetable');
    expect(aloft.compactLabel).toBe('Timetable');
    expect(aloft.countdownKind).toBe('arrival');
    expect(aloft.progress).toBeCloseTo(0.5);
    const flown = liveContent(manual, EMPTY_TRAVEL_DAY, EMPTY_FACTS, new Date('2026-08-25T12:00Z'));
    expect(flown.headline).toBe('Flown');
    expect(flown.subtitle).toMatch(/^Due to land .* · going by the timetable$/);
    expect(flown.compactLabel).toBe('Flown');
    expect(flown.countdownKind).toBeNull();
    expect(flown.progress).toBe(1);
    // A recorded stage past the airport is never second-guessed.
    const boarded = advance(EMPTY_TRAVEL_DAY, 'boarded', new Date('2026-08-25T07:30Z'));
    expect(liveContent(journey(), boarded, EMPTY_FACTS, new Date('2026-08-25T09:00Z')).headline).toBe(
      'Due to land in 2h',
    );
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
      advance(EMPTY_TRAVEL_DAY, 'boarded', liveNow, MANUAL),
      'departed',
      new Date('2026-08-25T08:00Z'),
      MANUAL,
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
    const boarded = advance(EMPTY_TRAVEL_DAY, 'boarded', liveNow, MANUAL);
    expect(liveContent(manual, boarded, EMPTY_FACTS, liveNow).subtitle).toBe(
      'On board · ready for pushback',
    );
    const departed = advance(boarded, 'departed', liveNow, MANUAL);
    expect(liveContent(manual, departed, EMPTY_FACTS, liveNow).compactLabel).toBe('In air');
  });

  it('anchors the self-ticking countdown to the estimate the headline counts to', () => {
    // Before take-off: the (estimated) departure. A posted delay moves it.
    const scheduled = liveContent(journey(), EMPTY_TRAVEL_DAY, EMPTY_FACTS, liveNow);
    expect(scheduled.countdownKind).toBe('departure');
    expect(scheduled.countdownEnd).toBe(Date.parse('2026-08-25T08:00Z'));
    expect(scheduled.departsAt).toBe(Date.parse('2026-08-25T08:00Z'));
    expect(scheduled.arrivesAt).toBe(Date.parse('2026-08-25T10:35Z'));
    const delayed = liveContent(
      journey(),
      EMPTY_TRAVEL_DAY,
      facts({ delayMinutes: 60, estimatedDeparture: '2026-08-25T09:00Z' }),
      liveNow,
    );
    expect(delayed.countdownEnd).toBe(Date.parse('2026-08-25T09:00Z'));
    // In the air: the (estimated) arrival.
    const aloft = liveContent(
      journey(),
      { stage: 'departed', stamps: { departed: '2026-08-25T08:05Z' } },
      facts({ actualDeparture: '2026-08-25T08:05Z', estimatedArrival: '2026-08-25T10:50Z' }),
      new Date('2026-08-25T09:00Z'),
    );
    expect(aloft.countdownKind).toBe('arrival');
    expect(aloft.countdownEnd).toBe(Date.parse('2026-08-25T10:50Z'));
    // Landed: nothing left to count.
    const landed = liveContent(
      journey(),
      { stage: 'landed', stamps: { departed: '2026-08-25T08:05Z', landed: '2026-08-25T10:40Z' } },
      EMPTY_FACTS,
      new Date('2026-08-25T10:45Z'),
    );
    expect(landed.countdownEnd).toBeNull();
    expect(landed.countdownKind).toBeNull();
    // Manual rows store bare wall clocks: pinned to the airport, not the phone.
    const manual = liveContent(
      journey({ source: 'manual', fromCode: 'COK', toCode: 'DOH', scheduledDeparture: '2026-09-09T04:15:00', scheduledArrival: '2026-09-09T06:05:00' }),
      EMPTY_TRAVEL_DAY,
      EMPTY_FACTS,
      new Date('2026-09-08T20:00Z'),
    );
    expect(manual.countdownEnd).toBe(Date.parse('2026-09-08T22:45Z'));
    expect(manual.arrivesAt).toBe(Date.parse('2026-09-09T03:05Z'));
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

describe('stage plans (connecting legs)', () => {
  const liveNow = new Date('2026-08-25T05:00Z');
  // A leg that connects off another and ends the trip: transit security,
  // the gate, the flight, then passport control and the bags.
  const LAST_LEG = stagePlan({ connecting: true, onward: false, entersHere: true, bagsHere: true });
  // A US first point of entry with a domestic leg to follow.
  const ENTRY_LEG = stagePlan({ connecting: false, onward: true, entersHere: true, bagsHere: true });
  const rules = { plan: LAST_LEG };

  it('never offers a stage the plan does not have', () => {
    expect(canAdvanceTo(EMPTY_TRAVEL_DAY, 'at_airport', rules)).toBe(false);
    expect(canAdvanceTo(EMPTY_TRAVEL_DAY, 'checked_in', rules)).toBe(false);
    expect(canAdvanceTo(EMPTY_TRAVEL_DAY, 'immigration', rules)).toBe(false);
    expect(canAdvanceTo(EMPTY_TRAVEL_DAY, 'security', rules)).toBe(true);
    expect(nextStage(EMPTY_TRAVEL_DAY, rules)).toBe('security');
    // A direct flight has no arrival steps to reach.
    const landed = applyFlightFacts(EMPTY_TRAVEL_DAY, facts({ actualArrival: '2026-08-25T10:40Z' }));
    expect(canAdvanceTo(landed, 'arrival_immigration')).toBe(false);
    expect(nextStage(landed)).toBeNull();
  });

  it('keeps the arrival steps locked until the landing is in', () => {
    const boarded = advance(EMPTY_TRAVEL_DAY, 'boarded', liveNow, rules);
    expect(canAdvanceTo(boarded, 'arrival_immigration', rules)).toBe(false);
    expect(nextStage(boarded, rules)).toBeNull();
    const landed = applyFlightFacts(boarded, facts({ actualArrival: '2026-08-25T10:40Z' }));
    expect(nextStage(landed, rules)).toBe('arrival_immigration');
    const through = advance(landed, 'arrival_immigration', liveNow, rules);
    expect(through.stage).toBe('arrival_immigration');
    expect(nextStage(through, rules)).toBe('bags_collected');
    const bags = advance(through, 'bags_collected', liveNow, rules);
    expect(nextStage(bags, rules)).toBeNull();
    // Skipping passport control straight to the belt is a skip, like any other.
    expect(advance(landed, 'bags_collected', liveNow, rules).stage).toBe('bags_collected');
    // Manual trips stamp the landing themselves first.
    const manualBoarded = advance(EMPTY_TRAVEL_DAY, 'boarded', liveNow, { ...rules, manualTrip: true });
    expect(canAdvanceTo(manualBoarded, 'arrival_immigration', { ...rules, manualTrip: true })).toBe(false);
    const manualLanded = advance(
      advance(manualBoarded, 'departed', liveNow, { ...rules, manualTrip: true }),
      'landed',
      liveNow,
      { ...rules, manualTrip: true },
    );
    expect(nextStage(manualLanded, { ...rules, manualTrip: true })).toBe('arrival_immigration');
  });

  it('a lagging landing never demotes an arrival step', () => {
    const landed = applyFlightFacts(EMPTY_TRAVEL_DAY, facts({ actualArrival: '2026-08-25T10:40Z' }));
    const through = advance(landed, 'arrival_immigration', liveNow, rules);
    expect(applyFlightFacts(through, facts({ actualArrival: '2026-08-25T10:40Z' }))).toEqual(through);
  });

  it('undo and rewind stay on the ground side of the flight', () => {
    const landed = applyFlightFacts(
      advance(EMPTY_TRAVEL_DAY, 'security', liveNow, rules),
      facts({ actualArrival: '2026-08-25T10:40Z' }),
    );
    const walked = advance(landed, 'arrival_immigration', liveNow, rules);
    const bags = advance(walked, 'bags_collected', liveNow, rules);
    expect(undoLast(bags, rules).stage).toBe('arrival_immigration');
    expect(undoLast(walked, rules).stage).toBe('landed');
    expect(canRewindTo(bags, 'arrival_immigration', rules)).toBe(true);
    // Never back across the flight on a tracked trip…
    expect(canRewindTo(bags, 'security', rules)).toBe(false);
    // …a manual trip owns every stamp.
    expect(canRewindTo(bags, 'security', { ...rules, manualTrip: true })).toBe(true);
  });

  it('holds the live window open while arrival steps remain', () => {
    const j = journey(); // lands 2026-08-25T10:35Z
    const landed: TravelDayState = { stage: 'landed', stamps: { landed: '2026-08-25T10:40Z' } };
    // A direct flight lets go half an hour after touchdown…
    expect(travelWindow(j, landed, new Date('2026-08-25T11:30Z')).phase).toBe('ended');
    // …a leg with passport control and bags ahead keeps its surfaces up.
    expect(travelWindow(j, landed, new Date('2026-08-25T11:30Z'), LAST_LEG).phase).toBe('live');
    expect(travelWindow(j, landed, new Date('2026-08-25T12:45Z'), LAST_LEG).phase).toBe('ended');
    // Done with the bags: half an hour more, then gone.
    const done: TravelDayState = {
      stage: 'bags_collected',
      stamps: { landed: '2026-08-25T10:40Z', bags_collected: '2026-08-25T11:20Z' },
    };
    expect(travelWindow(j, done, new Date('2026-08-25T11:45Z'), LAST_LEG).phase).toBe('live');
    expect(travelWindow(j, done, new Date('2026-08-25T11:55Z'), LAST_LEG).phase).toBe('ended');
  });

  it('speaks the arrival steps on the live surfaces', () => {
    const j = journey();
    const landedAt = new Date('2026-08-25T10:50Z');
    const landed = applyFlightFacts(EMPTY_TRAVEL_DAY, facts({ actualArrival: '2026-08-25T10:40Z' }));
    const down = liveContent(j, landed, EMPTY_FACTS, landedAt, LAST_LEG);
    expect(down.headline).toBe('Landed');
    expect(down.subtitle).toBe('Passport control');
    expect(down.compactLabel).toBe('Passport');
    expect(down.progress).toBe(1);
    const through = advance(landed, 'arrival_immigration', landedAt, rules);
    expect(liveContent(j, through, EMPTY_FACTS, landedAt, LAST_LEG).subtitle).toBe('Collect your bags');
    const belt = liveContent(j, through, facts({ baggageBelt: '7' }), landedAt, LAST_LEG);
    expect(belt.subtitle).toBe('Collect your bags · belt 7');
    expect(belt.compactLabel).toBe('Belt 7');
    // The headline stays "Landed" even when the airline's estimate is later
    // than the real touchdown — a recorded stage is never second-guessed.
    expect(
      liveContent(j, through, facts({ estimatedArrival: '2026-08-25T11:30Z' }), landedAt, LAST_LEG).headline,
    ).toBe('Landed');
    const bags = advance(through, 'bags_collected', landedAt, rules);
    const doneWith = liveContent(j, bags, facts({ baggageBelt: '7' }), landedAt, LAST_LEG);
    expect(doneWith.subtitle).toBe('Welcome to LHR');
    expect(doneWith.compactLabel).toBe('Bags');
    // A first point of entry: the bags go back in for the onward flight.
    const entryRules = { plan: ENTRY_LEG };
    const collected = advance(advance(landed, 'arrival_immigration', landedAt, entryRules), 'bags_collected', landedAt, entryRules);
    const recheck = liveContent(j, collected, EMPTY_FACTS, landedAt, ENTRY_LEG);
    expect(recheck.subtitle).toBe('Re-check your bags');
    expect(recheck.compactLabel).toBe('Bag drop');
    // A connecting leg's first step is security, not the airport.
    const waiting = liveContent(j, EMPTY_TRAVEL_DAY, EMPTY_FACTS, liveNow, LAST_LEG);
    expect(waiting.subtitle).toBe('Head to security');
  });
});
