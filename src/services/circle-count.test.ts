import { compactCount } from './circle';

describe('compactCount', () => {
  it('keeps small counts exact', () => {
    expect(compactCount(0)).toBe('0');
    expect(compactCount(7)).toBe('7');
    expect(compactCount(999)).toBe('999');
  });

  it('abbreviates thousands with one decimal', () => {
    expect(compactCount(1000)).toBe('1k');
    expect(compactCount(1234)).toBe('1.2k');
    expect(compactCount(9900)).toBe('9.9k');
  });

  it('drops the decimal from ten thousand', () => {
    expect(compactCount(10_000)).toBe('10k');
    expect(compactCount(123_456)).toBe('123k');
  });
});
