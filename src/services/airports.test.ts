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

  it('ranks code prefixes above city substrings', () => {
    // "HE" once returned ABE/AEG/AHE (cities containing "he") and never HEL.
    const codes = searchAirports('HE', 3).map((a) => a.iata);
    expect(codes).toContain('HEL');
    for (const code of codes) expect(code.startsWith('HE')).toBe(true);
  });

  it('ranks major hubs above other airports sharing the prefix', () => {
    // OurAirports flags LAD (Luanda) and LAO (Laoag City) large just like
    // LAX — the curated hub rank keeps the airports people mean on top.
    const la = searchAirports('LA', 6).map((a) => a.iata);
    expect(la.slice(0, 2)).toEqual(['LAS', 'LAX']);
    expect(searchAirports('HE', 3)[0]!.iata).toBe('HEL');
  });

  it('matches mid-name city words', () => {
    // "Helsinki (Vantaa)" — a word start inside the name, not a prefix.
    expect(searchAirports('Vantaa').map((a) => a.iata)).toContain('HEL');
  });

  it('respects the limit and empty queries', () => {
    expect(searchAirports('A', 3)).toHaveLength(3);
    expect(searchAirports('  ')).toHaveLength(0);
  });
});
