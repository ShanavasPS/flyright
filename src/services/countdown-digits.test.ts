import { countdownCells, countdownSpoken, faceWidth, flapMetrics } from './countdown-digits';

const digits = (cells: ReturnType<typeof countdownCells>) =>
  cells.map((c) => (c.kind === 'digit' ? c.value : ':')).join('');

describe('countdownCells', () => {
  it('reads HH:MM:SS with two-digit hours', () => {
    expect(digits(countdownCells((7 * 3600 + 31 * 60 + 36) * 1000))).toBe('07:31:36');
  });

  it('drops the seconds when asked, and the leading zero to one hour digit', () => {
    expect(digits(countdownCells((2 * 3600 + 5 * 60) * 1000, { seconds: false }))).toBe('02:05');
    expect(digits(countdownCells((2 * 3600 + 5 * 60) * 1000, { seconds: false, hourDigits: 1 }))).toBe('2:05');
  });

  it('grows the hours past 99 rather than wrapping', () => {
    expect(digits(countdownCells(100 * 3600 * 1000, { seconds: false }))).toBe('100:00');
  });

  it('floors to whole seconds and reads nothing left as zeros', () => {
    expect(digits(countdownCells(59_999))).toBe('00:00:59');
    expect(digits(countdownCells(-5000))).toBe('00:00:00');
    expect(digits(countdownCells(NaN))).toBe('00:00:00');
  });

  it('tags each digit with its group for the labels', () => {
    const groups = countdownCells(1000).filter((c) => c.kind === 'digit').map((c) => (c.kind === 'digit' ? c.group : ''));
    expect(groups).toEqual(['hours', 'hours', 'minutes', 'minutes', 'seconds', 'seconds']);
  });
});

describe('flapMetrics', () => {
  it('keeps the design proportions at the design height', () => {
    // The design: 32×50 tiles, 4 apart, digits 34, on a board padded 12.
    const m = flapMetrics(50);
    expect(m.fontSize).toBe(34);
    expect(m.tileWidth).toBeGreaterThan(30);
    expect(m.tileWidth).toBeLessThan(38);
    expect(m.gap).toBe(4);
    expect(m.boardPad).toBe(10);
    expect(m.boardRadius).toBe(14);
    expect(m.radius).toBe(6);
  });

  it('never lets the gap or radius collapse on a small face', () => {
    const m = flapMetrics(20);
    expect(m.gap).toBeGreaterThanOrEqual(2);
    expect(m.radius).toBeGreaterThanOrEqual(3);
  });
});

describe('faceWidth', () => {
  it('sums the tiles, the colon cells and the gaps between them', () => {
    const m = flapMetrics(50);
    const cells = countdownCells(0);
    expect(faceWidth(cells, m)).toBeCloseTo(6 * m.tileWidth + 2 * m.colonWidth + 7 * m.gap, 5);
  });
});

describe('countdownSpoken', () => {
  it('speaks the units it has', () => {
    expect(countdownSpoken((2 * 3600 + 1 * 60 + 5) * 1000)).toBe('2 hours 1 minute 5 seconds');
    expect(countdownSpoken(45 * 1000)).toBe('45 seconds');
    expect(countdownSpoken(3600 * 1000)).toBe('1 hour 0 minutes 0 seconds');
  });
});
