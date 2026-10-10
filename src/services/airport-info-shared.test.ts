import {
  airportInfoFrom,
  airportInfoWanted,
  hasAirportInfo,
  infoExpiry,
  infoKey,
  withAirportInfo,
  type AirportInfoFacts,
} from '../../convex/airportInfoShared';

const DEPARTURE = '2026-10-12T13:30Z';
const at = (iso: string) => Date.parse(iso);

function facts(overrides: Partial<AirportInfoFacts> = {}): AirportInfoFacts {
  return {
    landed: false,
    from: { code: 'DFW' },
    to: { code: 'ORD' },
    scheduledDeparture: DEPARTURE,
    estimatedDeparture: null,
    actualDeparture: null,
    scheduledArrival: '2026-10-12T16:09Z',
    estimatedArrival: null,
    actualArrival: null,
    gate: null,
    terminal: null,
    baggageBelt: null,
    ...overrides,
  };
}

describe('airportInfoWanted', () => {
  it('waits for the day before departure', () => {
    expect(airportInfoWanted(facts(), at('2026-10-10T13:00Z'))).toBe(false);
    expect(airportInfoWanted(facts(), at('2026-10-11T14:00Z'))).toBe(true);
  });

  it('asks while the gate or the terminal is missing, and not once both are known', () => {
    const now = at('2026-10-12T10:00Z');
    expect(airportInfoWanted(facts({ terminal: 'C' }), now)).toBe(true);
    expect(airportInfoWanted(facts({ gate: 'C20' }), now)).toBe(true);
    expect(airportInfoWanted(facts({ gate: 'C20', terminal: 'C' }), now)).toBe(false);
  });

  it('asks for the belt from departure until a while after landing', () => {
    const flying = facts({ gate: 'C20', terminal: 'C', actualDeparture: '2026-10-12T13:41Z' });
    expect(airportInfoWanted(flying, at('2026-10-12T15:00Z'))).toBe(true);
    const down = { ...flying, landed: true, actualArrival: '2026-10-12T16:00Z' };
    expect(airportInfoWanted(down, at('2026-10-12T17:00Z'))).toBe(true);
    expect(airportInfoWanted(down, at('2026-10-12T18:00Z'))).toBe(false);
    expect(airportInfoWanted({ ...down, baggageBelt: '7' }, at('2026-10-12T16:10Z'))).toBe(false);
  });

  it('never asks about a flight it could not match', () => {
    const now = at('2026-10-12T10:00Z');
    expect(airportInfoWanted(facts({ from: { code: null } }), now)).toBe(false);
    expect(airportInfoWanted(facts({ scheduledDeparture: null }), now)).toBe(false);
  });
});

describe('airportInfoFrom', () => {
  it('reads the three facts and drops blanks', () => {
    const info = airportInfoFrom({ fa_flight_id: 'x', gate_origin: ' C20 ', terminal_origin: '', baggage_claim: 'B7' });
    expect(info).toEqual({ gate: 'C20', terminal: null, baggageBelt: 'B7' });
    expect(hasAirportInfo(info)).toBe(true);
  });

  it('is empty for a flight that was not found', () => {
    expect(hasAirportInfo(airportInfoFrom(null))).toBe(false);
  });
});

describe('withAirportInfo', () => {
  it('fills gaps and never replaces what the status provider said', () => {
    const merged = withAirportInfo(facts({ terminal: '3' }), { gate: 'C20', terminal: 'C', baggageBelt: null });
    expect(merged).toMatchObject({ gate: 'C20', terminal: '3', baggageBelt: null });
  });

  it('leaves times alone', () => {
    const before = facts({ estimatedDeparture: '2026-10-12T13:45Z' });
    const merged = withAirportInfo(before, { gate: 'C20', terminal: 'C', baggageBelt: '7' });
    expect({ ...merged, gate: null, terminal: null, baggageBelt: null }).toEqual(before);
  });

  it('returns the answer untouched with nothing to add', () => {
    const before = facts();
    expect(withAirportInfo(before, null)).toBe(before);
  });
});

describe('caching', () => {
  it('keeps its own key beside the flight path', () => {
    expect(infoKey('AA328', '2026-10-12')).toBe('AA328:2026-10-12:info');
  });

  it('asks again sooner close to departure, and keeps a belt', () => {
    const minutes = (now: string, info: Parameters<typeof infoExpiry>[0], f = facts()) =>
      (infoExpiry(info, f, at(now)) - at(now)) / 60_000;
    const none = { gate: null, terminal: null, baggageBelt: null };
    expect(minutes('2026-10-11T20:00Z', none)).toBe(60);
    expect(minutes('2026-10-12T12:00Z', none)).toBe(10);
    expect(minutes('2026-10-12T08:00Z', { ...none, gate: 'C20' })).toBe(30);
    expect(minutes('2026-10-12T12:00Z', { ...none, gate: 'C20' })).toBe(10);
    expect(minutes('2026-10-12T17:00Z', { ...none, baggageBelt: '7' })).toBe(360);
  });
});
