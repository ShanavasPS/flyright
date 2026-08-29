import { NEXT_STATUSES, canTransition, isClosed, type ClaimStatus } from './claim-status';

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
