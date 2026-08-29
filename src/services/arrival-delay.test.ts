import { resolveDelayMinutes } from './arrival-delay';
import type { FlightStatus } from './flight-lookup';

function status(partial: Partial<FlightStatus>): FlightStatus {
  return {
    flight: 'AY1331',
    date: '2026-08-10',
    status: 'scheduled',
    delayMinutes: null,
    distanceKm: 1834,
    carrier: { name: 'Finnair', iata: 'AY' },
    carrierCountry: 'FI',
    from: { code: 'HEL', country: 'FI' },
    to: { code: 'LHR', country: 'GB' },
    scheduledDeparture: '2026-08-10T08:00:00Z',
    scheduledArrival: '2026-08-10T10:35:00Z',
    ...partial,
  };
}

describe('resolveDelayMinutes', () => {
  it('prefers the live final delay once landed', () => {
    expect(resolveDelayMinutes(status({ landed: true, delayMinutes: 195 }), 40)).toBe(195);
  });

  it('prefers a live prediction over the recorded cache', () => {
    expect(resolveDelayMinutes(status({ delayMinutes: 45 }), 195)).toBe(45);
  });

  it('lets a recovered prediction clear the recorded delay before landing', () => {
    expect(resolveDelayMinutes(status({ landed: false, delayMinutes: null }), 195)).toBeNull();
  });

  it('falls back to the recorded delay when the lookup has no data', () => {
    // Provider forgot the flight (404) or the query is still in flight.
    expect(resolveDelayMinutes(undefined, 195)).toBe(195);
  });

  it('falls back to the recorded delay when landed without usable times', () => {
    expect(resolveDelayMinutes(status({ landed: true, delayMinutes: null }), 195)).toBe(195);
  });

  it('reads an on-time landing as no disruption', () => {
    expect(resolveDelayMinutes(status({ landed: true, delayMinutes: 0 }), 195)).toBe(0);
  });

  it('resolves a recorded zero to null so the trip reads as journal', () => {
    expect(resolveDelayMinutes(undefined, 0)).toBeNull();
  });

  it('returns null with nothing to go on', () => {
    expect(resolveDelayMinutes(undefined, undefined)).toBeNull();
    expect(resolveDelayMinutes(undefined, null)).toBeNull();
  });
});
