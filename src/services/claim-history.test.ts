import { appendHistory, parseHistory, reachedAt } from './claim-history';

describe('claim status history', () => {
  it('appends outcomes in order with their dates', () => {
    const a = appendHistory(null, 'acknowledged', new Date('2026-07-15T10:00:00Z'));
    const b = appendHistory(a, 'paid', new Date('2026-07-28T09:30:00Z'));
    expect(parseHistory(b)).toEqual([
      { status: 'acknowledged', at: '2026-07-15T10:00:00.000Z' },
      { status: 'paid', at: '2026-07-28T09:30:00.000Z' },
    ]);
    expect(reachedAt(b, 'paid')).toBe('2026-07-28T09:30:00.000Z');
    expect(reachedAt(b, 'rejected')).toBeNull();
  });

  it('keeps the latest date when a status recurs', () => {
    let h = appendHistory(null, 'rejected', new Date('2026-05-01T00:00:00Z'));
    h = appendHistory(h, 'escalated', new Date('2026-05-10T00:00:00Z'));
    h = appendHistory(h, 'rejected', new Date('2026-06-01T00:00:00Z'));
    expect(reachedAt(h, 'rejected')).toBe('2026-06-01T00:00:00.000Z');
  });

  it('reads missing or malformed values as no history', () => {
    for (const bad of [null, undefined, '', 'nope', '{}', '[1]', '[{"status":"won","at":"2026-01-01"}]', '[{"status":"paid","at":"soon"}]']) {
      expect(parseHistory(bad)).toEqual([]);
    }
    expect(appendHistory('broken', 'paid', new Date('2026-01-01T00:00:00Z'))).toBe(
      '[{"status":"paid","at":"2026-01-01T00:00:00.000Z"}]',
    );
  });
});
