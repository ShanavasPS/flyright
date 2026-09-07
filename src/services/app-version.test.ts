import { compareVersions, notesBetween } from './app-version';

const notes = [
  { version: '1.0.25', date: '2026-09-06', notes: ['e'] },
  { version: '1.0.21', date: '2026-09-05', notes: ['d'] },
  { version: '1.0.20', date: '2026-09-04', notes: ['c'] },
  { version: '1.0.18', date: '2026-09-01', notes: ['b'] },
  { version: '1.0.9', date: '2026-08-26', notes: ['a'] },
];

describe('compareVersions', () => {
  it('orders numerically, not lexically', () => {
    expect(compareVersions('1.0.9', '1.0.10')).toBeLessThan(0);
    expect(compareVersions('1.0.25', '1.0.25')).toBe(0);
    expect(compareVersions('1.1', '1.0.99')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });
});

describe('notesBetween', () => {
  it('returns the releases an update would bring, newest first', () => {
    expect(notesBetween(notes, '1.0.18', '1.0.21').map((n) => n.version)).toEqual([
      '1.0.21',
      '1.0.20',
    ]);
  });

  it('never announces past what the store serves', () => {
    expect(notesBetween(notes, '1.0.20', '1.0.21').map((n) => n.version)).toEqual(['1.0.21']);
    expect(notesBetween(notes, '1.0.25', '1.0.25')).toEqual([]);
    expect(notesBetween(notes, '1.0.26', '1.0.25')).toEqual([]);
  });
});
