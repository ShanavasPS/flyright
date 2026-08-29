import {
  NEXT_STATUSES,
  canTransition,
  isClosed,
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
