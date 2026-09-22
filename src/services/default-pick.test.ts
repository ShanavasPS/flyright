import { keepOrFallback, pickClaim, pickPerson, type PickableClaim } from './default-pick';

const NOW = Date.parse('2026-09-22T12:00:00Z');

const claim = (id: string, status: PickableClaim['status'], createdAt: string, responseDeadline: string | null = null): PickableClaim => ({
  id,
  status,
  createdAt,
  responseDeadline,
});

describe('pickClaim', () => {
  it('prefers an overdue claim over newer open ones', () => {
    const rows = [
      claim('newer-sent', 'sent', '2026-09-10T00:00:00Z', '2026-10-20T00:00:00Z'),
      claim('overdue', 'sent', '2026-08-08T00:00:00Z', '2026-09-19T00:00:00Z'),
      claim('paid', 'paid', '2026-09-15T00:00:00Z'),
    ];
    expect(pickClaim(rows, NOW)).toBe('overdue');
  });

  it('falls back to the newest open claim', () => {
    const rows = [
      claim('old-open', 'acknowledged', '2026-07-01T00:00:00Z'),
      claim('new-open', 'sent', '2026-09-01T00:00:00Z', '2026-10-13T00:00:00Z'),
      claim('newest-closed', 'rejected', '2026-09-20T00:00:00Z'),
    ];
    expect(pickClaim(rows, NOW)).toBe('new-open');
  });

  it('picks the newest closed claim when nothing is open', () => {
    const rows = [
      claim('rejected', 'rejected', '2026-03-02T00:00:00Z'),
      claim('paid', 'paid', '2026-06-20T00:00:00Z'),
    ];
    expect(pickClaim(rows, NOW)).toBe('paid');
  });

  it('treats a draft as open and a missing deadline as not overdue', () => {
    expect(pickClaim([claim('draft', 'draft', '2026-09-01T00:00:00Z')], NOW)).toBe('draft');
    expect(pickClaim([claim('sent', 'sent', '2026-01-01T00:00:00Z', null)], NOW)).toBe('sent');
  });

  it('returns null for no claims and never mutates its input', () => {
    expect(pickClaim([], NOW)).toBeNull();
    const rows = [claim('b', 'paid', '2026-01-01T00:00:00Z'), claim('a', 'paid', '2026-02-01T00:00:00Z')];
    const before = rows.map((r) => r.id);
    pickClaim(rows, NOW);
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

describe('pickPerson', () => {
  const noah = { userId: 'noah', next: { scheduledDeparture: '2026-10-07T13:40:00Z' } };
  const clara = { userId: 'clara', next: { scheduledDeparture: '2026-10-04T05:25:00Z' } };
  const omar = { userId: 'omar', next: null };
  const past = { userId: 'past', next: { scheduledDeparture: '2026-09-01T00:00:00Z' } };

  it('prefers someone in the air', () => {
    expect(pickPerson([noah, clara, omar], [], new Set(['omar']), NOW)).toBe('omar');
  });

  it('otherwise picks the soonest upcoming departure, ignoring past ones', () => {
    expect(pickPerson([past, noah, clara, omar], [], new Set(), NOW)).toBe('clara');
  });

  it('otherwise the first person followed, then the first follower', () => {
    expect(pickPerson([omar, past], [], new Set(), NOW)).toBe('omar');
    expect(pickPerson([], [{ userId: 'ella' }], new Set(), NOW)).toBe('ella');
    expect(pickPerson([], [], new Set(), NOW)).toBeNull();
  });

  it('ignores an in-air id that is only a follower', () => {
    expect(pickPerson([noah], [{ userId: 'tomas' }], new Set(['tomas']), NOW)).toBe('noah');
  });

  it('survives an unparseable departure', () => {
    expect(pickPerson([{ userId: 'x', next: { scheduledDeparture: 'soon' } }], [], new Set(), NOW)).toBe('x');
  });
});

describe('keepOrFallback', () => {
  it('keeps a selection that still exists and falls back when it vanished', () => {
    const ids = new Set(['a', 'b']);
    expect(keepOrFallback('b', ids, () => 'a')).toBe('b');
    expect(keepOrFallback('gone', ids, () => 'a')).toBe('a');
    expect(keepOrFallback(null, ids, () => 'a')).toBe('a');
    expect(keepOrFallback('gone', new Set(), () => null)).toBeNull();
  });
});
