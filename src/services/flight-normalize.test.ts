import { normalizeLeg } from '../../convex/flightNormalize';

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
