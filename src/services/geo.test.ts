import { haversineKm } from './geo';

// Coordinates from assets/data/airports.json.
const HEL = [60.3184, 24.9633] as const;
const FRA = [50.0267, 8.5584] as const;
const TLL = [59.4132, 24.8326] as const;
const JFK = [40.6394, -73.7793] as const;
const LHR = [51.4707, -0.4599] as const;

describe('haversineKm', () => {
  it('matches the known HEL→FRA distance', () => {
    // The dev-mock leg in flight-status+api.ts uses 1531 km for the same
    // route; great-circle from airport coordinates lands within ~1%.
    expect(haversineKm(...HEL, ...FRA)).toBe(1539);
  });

  it('handles short hops', () => {
    expect(haversineKm(...HEL, ...TLL)).toBe(101);
  });

  it('handles long haul across the meridian', () => {
    expect(haversineKm(...LHR, ...JFK)).toBe(5540);
  });

  it('returns 0 for identical points', () => {
    expect(haversineKm(...HEL, ...HEL)).toBe(0);
  });
});
