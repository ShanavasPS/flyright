import { getAirport, isValidIata, searchAirports } from './airports';

describe('getAirport', () => {
  it('resolves a known code, case-insensitively', () => {
    const hel = getAirport('hel');
    expect(hel).toMatchObject({ iata: 'HEL', country: 'FI' });
    expect(hel!.city).toContain('Helsinki');
  });

  it('returns undefined for unknown or malformed codes', () => {
    expect(getAirport('ZZZ')).toBeUndefined();
    expect(getAirport('HELSINKI')).toBeUndefined();
    expect(getAirport('')).toBeUndefined();
  });
});

describe('isValidIata', () => {
  it('accepts only 3-letter codes present in the dataset', () => {
    expect(isValidIata('HEL')).toBe(true);
    expect(isValidIata(' fra ')).toBe(true);
    expect(isValidIata('ZZZ')).toBe(false);
    expect(isValidIata('HE')).toBe(false);
    expect(isValidIata('123')).toBe(false);
  });
});

describe('searchAirports', () => {
  it('puts an exact code match first', () => {
    expect(searchAirports('HEL')[0]!.iata).toBe('HEL');
  });

  it('matches city names', () => {
    const results = searchAirports('Tallinn');
    expect(results.map((a) => a.iata)).toContain('TLL');
  });

  it('respects the limit and empty queries', () => {
    expect(searchAirports('A', 3)).toHaveLength(3);
    expect(searchAirports('  ')).toHaveLength(0);
  });
});
