import {
  NEXT_STATUSES,
  canTransition,
  claimsSummary,
  isClosed,
  letterExcerpt,
  parseSentSnapshot,
  type ClaimStatus,
} from './claim-status';

const ALL: ClaimStatus[] = ['draft', 'sent', 'acknowledged', 'paid', 'rejected', 'escalated'];

describe('claim outcome graph', () => {
  it('lets a sent claim record every real-world response', () => {
    expect(NEXT_STATUSES.sent).toEqual(['acknowledged', 'paid', 'rejected']);
  });

  it('keeps drafts with the wizard and paid terminal', () => {
    expect(NEXT_STATUSES.draft).toEqual([]);
    expect(NEXT_STATUSES.paid).toEqual([]);
  });

  it('offers escalation from a rejection, and lets escalation settle either way', () => {
    expect(canTransition('rejected', 'escalated')).toBe(true);
    expect(canTransition('escalated', 'paid')).toBe(true);
    expect(canTransition('escalated', 'rejected')).toBe(true);
  });

  it('never resurrects a draft or demotes to sent', () => {
    for (const from of ALL) {
      expect(canTransition(from, 'draft')).toBe(false);
      expect(canTransition(from, 'sent')).toBe(false);
    }
  });

  it('splits sections: paid and rejected are closed, the rest active', () => {
    expect(ALL.filter(isClosed)).toEqual(['paid', 'rejected']);
  });
});

describe('parseSentSnapshot', () => {
  const snapshot = {
    subject: 'EU261 claim — Finnair XX999, 2026-06-15',
    body: 'Dear Customer Relations,…',
    letterHtml: '<html></html>',
    recipient: 'Customer Relations — Finnair',
    claimantName: 'Ada Traveler',
    claimantEmail: 'ada@example.com',
    pdfName: 'EU261-claim-XX999-2026-06-15.pdf',
    via: 'email' as const,
  };

  it('round-trips a stored snapshot', () => {
    expect(parseSentSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('rejects null, garbage, and shape mismatches instead of throwing', () => {
    expect(parseSentSnapshot(null)).toBeNull();
    expect(parseSentSnapshot(undefined)).toBeNull();
    expect(parseSentSnapshot('not json')).toBeNull();
    expect(parseSentSnapshot('{"subject":"x"}')).toBeNull();
    expect(parseSentSnapshot('42')).toBeNull();
  });
});

describe('letterExcerpt', () => {
  it('turns the letter HTML into one plain line', () => {
    expect(
      letterExcerpt('<html><head><style>p{color:red}</style></head><body><p>Dear Finnair,</p><p>I am claiming &euro;400 &amp; costs.</p></body></html>'),
    ).toBe('Dear Finnair, I am claiming €400 & costs.');
  });

  it('cuts on a word and ends with an ellipsis', () => {
    const out = letterExcerpt(`<p>${'word '.repeat(80)}</p>`, 50);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out).not.toMatch(/wor…$/);
  });

  it('keeps a short letter whole and survives empty input', () => {
    expect(letterExcerpt('<p>Short.</p>')).toBe('Short.');
    expect(letterExcerpt('')).toBe('');
  });
});

describe('claimsSummary', () => {
  const c = (status: ClaimStatus, amount: number, currency = 'EUR') => ({ status, amount, currency });

  it('sums what is in progress and what was paid, then counts', () => {
    expect(claimsSummary([c('sent', 400), c('sent', 400), c('paid', 350, 'GBP')])).toEqual([
      { value: '800 EUR', label: 'in progress', money: true },
      { value: '350 GBP', label: 'paid', money: true },
      { value: '3', label: 'claims', money: false },
    ]);
  });

  it('counts instead of adding across currencies', () => {
    expect(claimsSummary([c('sent', 400), c('acknowledged', 350, 'GBP')])[0]).toEqual({
      value: '2',
      label: 'in progress',
      money: false,
    });
  });

  it('with nothing open, shows paid, rejected and the count', () => {
    expect(claimsSummary([c('paid', 350, 'GBP'), c('rejected', 250)])).toEqual([
      { value: '350 GBP', label: 'paid', money: true },
      { value: '1', label: 'rejected', money: false },
      { value: '2', label: 'claims', money: false },
    ]);
  });

  it('says one claim in the singular and nothing for none', () => {
    expect(claimsSummary([c('sent', 400)])).toEqual([
      { value: '400 EUR', label: 'in progress', money: true },
      { value: '1', label: 'claim', money: false },
    ]);
    expect(claimsSummary([])).toEqual([]);
  });
});
