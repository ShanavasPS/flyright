import { legPlaces, planFromSession, stagePlanFor, stagePlans } from '@/services/travel-day-plan';
import { DEFAULT_PLAN, stagePlan } from '@/services/travel-day';

type Leg = {
  id: string;
  fromCode: string;
  toCode: string;
  scheduledDeparture: string;
  scheduledArrival: string;
};

const leg = (id: string, from: string, to: string, dep: string, arr: string): Leg => ({
  id,
  fromCode: from,
  toCode: to,
  scheduledDeparture: dep,
  scheduledArrival: arr,
});

const AIRPORT_WALK = ['at_airport', 'checked_in', 'bag_dropped', 'security', 'immigration', 'boarded'];
const TRANSIT_WALK = ['security', 'boarded'];
const FLIGHT = ['departed', 'landed'];

describe('stagePlan', () => {
  it('a flight on its own keeps the airport walk and ends at the landing', () => {
    expect(stagePlan({ connecting: false, onward: false, entersHere: false, bagsHere: false })).toEqual(
      DEFAULT_PLAN,
    );
  });

  it('a connecting leg starts airside and clears passport control after landing', () => {
    expect(stagePlan({ connecting: true, onward: false, entersHere: true, bagsHere: true })).toEqual([
      ...TRANSIT_WALK,
      ...FLIGHT,
      'arrival_immigration',
      'bags_collected',
    ]);
  });

  it('a first point of entry collects the bags and drops them again', () => {
    expect(stagePlan({ connecting: false, onward: true, entersHere: true, bagsHere: true })).toEqual([
      ...AIRPORT_WALK,
      ...FLIGHT,
      'arrival_immigration',
      'bags_collected',
      'bags_rechecked',
    ]);
  });
});

describe('legPlaces / stagePlans', () => {
  it('HEL → DOH → BOM: transit at Doha, immigration and bags at Bombay', () => {
    const legs = [
      leg('a', 'HEL', 'DOH', '2026-10-01T10:00Z', '2026-10-01T17:30Z'),
      leg('b', 'DOH', 'BOM', '2026-10-01T20:00Z', '2026-10-02T00:30Z'),
    ];
    const planOf = stagePlans(legs);
    expect(planOf('a')).toEqual([...AIRPORT_WALK, ...FLIGHT]);
    expect(planOf('b')).toEqual([...TRANSIT_WALK, ...FLIGHT, 'arrival_immigration', 'bags_collected']);
  });

  it('HEL → JFK → LAX: everything clears at JFK, the domestic leg ends at the belt', () => {
    const legs = [
      leg('a', 'HEL', 'JFK', '2026-10-01T10:00Z', '2026-10-01T18:30Z'),
      leg('b', 'JFK', 'LAX', '2026-10-01T21:00Z', '2026-10-02T03:00Z'),
    ];
    const planOf = stagePlans(legs);
    expect(planOf('a')).toEqual([
      ...AIRPORT_WALK,
      ...FLIGHT,
      'arrival_immigration',
      'bags_collected',
      'bags_rechecked',
    ]);
    expect(planOf('b')).toEqual([...TRANSIT_WALK, ...FLIGHT, 'bags_collected']);
  });

  it('LHR → JFK → GRU: the US clears international transfers too', () => {
    const legs = [
      leg('a', 'LHR', 'JFK', '2026-10-01T10:00Z', '2026-10-01T18:30Z'),
      leg('b', 'JFK', 'GRU', '2026-10-01T22:00Z', '2026-10-02T08:00Z'),
    ];
    const placeOf = legPlaces(legs);
    expect(placeOf('a')).toEqual({ connecting: false, onward: true, entersHere: true, bagsHere: true });
    expect(placeOf('b')).toEqual({ connecting: true, onward: false, entersHere: true, bagsHere: true });
  });

  it('BOM → FRA → HEL: passport control at the first Schengen airport, bags run through', () => {
    const legs = [
      leg('a', 'BOM', 'FRA', '2026-10-01T02:00Z', '2026-10-01T08:30Z'),
      leg('b', 'FRA', 'HEL', '2026-10-01T11:00Z', '2026-10-01T13:50Z'),
    ];
    const placeOf = legPlaces(legs);
    expect(placeOf('a')).toEqual({ connecting: false, onward: true, entersHere: true, bagsHere: false });
    expect(placeOf('b')).toEqual({ connecting: true, onward: false, entersHere: false, bagsHere: true });
    expect(stagePlans(legs)('b')).toEqual([...TRANSIT_WALK, ...FLIGHT, 'bags_collected']);
  });

  it('DOH → DEL → BOM: an international → domestic connection reclaims the bags at Delhi', () => {
    const legs = [
      leg('a', 'DOH', 'DEL', '2026-10-01T02:00Z', '2026-10-01T08:30Z'),
      leg('b', 'DEL', 'BOM', '2026-10-01T11:00Z', '2026-10-01T13:10Z'),
    ];
    const placeOf = legPlaces(legs);
    expect(placeOf('a')).toEqual({ connecting: false, onward: true, entersHere: true, bagsHere: true });
    expect(placeOf('b')).toEqual({ connecting: true, onward: false, entersHere: false, bagsHere: true });
  });

  it('LAX → DEN → JFK: no passport control anywhere, bags at the end', () => {
    const legs = [
      leg('a', 'LAX', 'DEN', '2026-10-01T14:00Z', '2026-10-01T17:30Z'),
      leg('b', 'DEN', 'JFK', '2026-10-01T19:00Z', '2026-10-02T01:00Z'),
    ];
    const planOf = stagePlans(legs);
    expect(planOf('a')).toEqual([...AIRPORT_WALK, ...FLIGHT]);
    expect(planOf('b')).toEqual([...TRANSIT_WALK, ...FLIGHT, 'bags_collected']);
  });

  it('legs that do not connect are flights on their own', () => {
    const legs = [
      leg('a', 'HEL', 'LHR', '2026-10-01T08:00Z', '2026-10-01T10:35Z'),
      leg('b', 'LHR', 'HEL', '2026-10-08T12:00Z', '2026-10-08T16:35Z'),
    ];
    expect(stagePlans(legs)('a')).toEqual(DEFAULT_PLAN);
    expect(stagePlans(legs)('b')).toEqual(DEFAULT_PLAN);
    expect(stagePlanFor({ id: 'zzz' }, legs)).toEqual(DEFAULT_PLAN);
  });
});

describe('planFromSession', () => {
  it('keeps known stages in the one order and falls back to a direct flight', () => {
    expect(planFromSession(undefined)).toEqual(DEFAULT_PLAN);
    expect(planFromSession(['bags_collected', 'landed', 'security', 'departed', 'boarded'])).toEqual([
      'security',
      'boarded',
      'departed',
      'landed',
      'bags_collected',
    ]);
    expect(planFromSession(['made_up'])).toEqual(DEFAULT_PLAN);
  });
});
