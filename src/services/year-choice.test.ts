import { shiftYears, withYear, yearChoices } from './year-choice';

describe('withYear', () => {
  it('replaces the year and keeps the day', () => {
    expect(withYear('2027-01-18', 2026)).toBe('2026-01-18');
  });
  it('lands 29 Feb on 28 Feb in a year without one', () => {
    expect(withYear('2028-02-29', 2027)).toBe('2027-02-28');
    expect(withYear('2028-02-29', 2032)).toBe('2032-02-29');
  });
});

describe('shiftYears', () => {
  it('moves whole years, across a New Year arrival', () => {
    expect(shiftYears('2027-01-01', -1)).toBe('2026-01-01');
    expect(shiftYears('2026-12-31', 1)).toBe('2027-12-31');
  });
});

describe('yearChoices', () => {
  const today = new Date(2026, 8, 8, 12);
  it('offers last, this and next year', () => {
    expect(yearChoices('2026-01-18', today)).toEqual([2025, 2026, 2027]);
  });
  it('keeps a year the date already has, outside that span', () => {
    expect(yearChoices('2019-05-02', today)).toEqual([2019, 2025, 2026, 2027]);
  });
});
