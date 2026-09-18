import { legDepartingOn, normalizeLeg, normalizePosition } from '../../convex/flightNormalize';

// Three months after the flight: the day the receipt was imported.
const NOW = Date.parse('2026-09-06T18:00:00Z');

/** An Etihad leg as AeroDataBox still reports it months later: departed,
 * with a scheduled and a predicted arrival at Kochi, and never an actual
 * one — the arrival feed never closed it out. */
function leg(status: string, arrival: Record<string, unknown>) {
  return {
    status,
    departure: {
      airport: { iata: 'AUH', countryCode: 'AE' },
      scheduledTime: { utc: '2026-06-07 04:40Z' },
      revisedTime: { utc: '2026-06-07 04:40Z' },
    },
    arrival: {
      airport: { iata: 'COK', countryCode: 'IN' },
      scheduledTime: { utc: '2026-06-07 08:45Z' },
      ...arrival,
    },
  };
}

describe('normalizeLeg — a flight the provider never landed', () => {
  it('takes an airborne record a day past its expected arrival as landed, with no delay to judge', () => {
    const facts = normalizeLeg(
      leg('Departed', { predictedTime: { utc: '2026-06-07 08:20Z' } }),
      'EY332',
      '2026-06-07',
      null,
      NOW,
    );
    expect(facts.landed).toBe(true);
    expect(facts.delayMinutes).toBeNull();
    expect(facts.actualArrival).toBeNull();
  });

  it('keeps a flight in the air while it is still due', () => {
    const inFlight = Date.parse('2026-06-07T07:00:00Z');
    const facts = normalizeLeg(
      leg('EnRoute', { predictedTime: { utc: '2026-06-07 08:20Z' } }),
      'EY332',
      '2026-06-07',
      null,
      inFlight,
    );
    expect(facts.landed).toBe(false);
    expect(facts.delayMinutes).toBeNull();
  });

  it('does not land a flight that never left', () => {
    const facts = normalizeLeg(leg('Delayed', {}), 'EY332', '2026-06-07', null, NOW);
    expect(facts.landed).toBe(false);
  });

  it('still reads the delay off a reported arrival', () => {
    const facts = normalizeLeg(
      leg('Arrived', { revisedTime: { utc: '2026-06-07 09:10Z' } }),
      'EY332',
      '2026-06-07',
      null,
      NOW,
    );
    expect(facts.landed).toBe(true);
    expect(facts.delayMinutes).toBe(25);
  });
});

describe('legDepartingOn — the provider answers a date with everything that touches it', () => {
  const doha = (day: string, hour = '19:40') => ({
    number: 'QR 516',
    departure: {
      airport: { iata: 'DOH' },
      scheduledTime: { utc: `${day} ${hour}Z`, local: `${day} ${hour}+03:00` },
    },
  });

  it('picks the leg that departs on the day, not yesterday’s that lands on it', () => {
    const legs = [doha('2026-09-18'), doha('2026-09-19')];
    expect(legDepartingOn(legs, '2026-09-19')).toBe(legs[1]);
  });

  it('judges by the local stamp when the UTC day differs', () => {
    // 00:30 local in Doha is still the previous day in UTC.
    const early = {
      departure: { scheduledTime: { utc: '2026-09-18 21:30Z', local: '2026-09-19 00:30+03:00' } },
    };
    expect(legDepartingOn([doha('2026-09-18'), early], '2026-09-19')).toBe(early);
  });

  it('falls back to the first leg when none departs on the day', () => {
    const legs = [doha('2026-09-18')];
    expect(legDepartingOn(legs, '2026-09-19')).toBe(legs[0]);
  });

  it('is null for an empty or malformed answer', () => {
    expect(legDepartingOn([], '2026-09-19')).toBeNull();
    expect(legDepartingOn(null, '2026-09-19')).toBeNull();
  });
});

describe('normalizePosition', () => {
  // AA1 over Kansas, as the direct gateway answered `withLocation=true` on
  // 2026-09-18: the QNH altitude is 0 (no pressure setting), the pressure
  // altitude is the real one, and the timestamp has no zone suffix.
  const location = {
    pressureAltitude: { meter: 10363.2, km: 10.36, mile: 6.44, nm: 5.6, feet: 34000 },
    altitude: { meter: 0, km: 0, mile: 0, nm: 0, feet: 0 },
    pressure: { hPa: 0, inHg: 0, mmHg: 0 },
    groundSpeed: { kt: 460, kmPerHour: 852, miPerHour: 529, meterPerSecond: 237 },
    trueTrack: { deg: 261, rad: 4.5553 },
    vsiFpm: 64,
    reportedAtUtc: '2026-09-18 15:11',
    lat: 39.33879,
    lon: -95.84509,
  };

  it('reads the fix, preferring the pressure altitude when QNH is unknown', () => {
    expect(normalizePosition(location)).toEqual({
      latitude: 39.33879,
      longitude: -95.84509,
      altitudeFt: 34000,
      groundSpeedKt: 460,
      trackDeg: 261,
      reportedAt: '2026-09-18T15:11Z',
    });
  });

  it('is null without coordinates, a time, or a location at all', () => {
    expect(normalizePosition(null)).toBeNull();
    expect(normalizePosition({ ...location, lat: undefined })).toBeNull();
    expect(normalizePosition({ ...location, reportedAtUtc: undefined })).toBeNull();
  });

  it('rides along on an airborne leg and is dropped once landed', () => {
    const airborne = normalizeLeg(
      { ...leg('EnRoute', { predictedTime: { utc: '2026-09-18 18:09Z' } }), location },
      'AA1',
      '2026-09-18',
      null,
      Date.parse('2026-09-18T15:12:00Z'),
    );
    expect(airborne.position?.latitude).toBe(39.33879);
    const landed = normalizeLeg(
      { ...leg('Arrived', { actualTime: { utc: '2026-09-18 18:05Z' } }), location },
      'AA1',
      '2026-09-18',
      null,
      Date.parse('2026-09-18T19:00:00Z'),
    );
    expect(landed.position).toBeNull();
  });
});
