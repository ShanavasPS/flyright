import { loungeOptions, type Lounge } from './lounge-access';
import {
  enginePass,
  membershipYearStart,
  networkInfo,
  runningLow,
  visitsLeft,
  visitsLeftLabel,
  visitsUsed,
  type PassLike,
  type VisitLike,
} from './lounge-pass-logic';

const pass = (over: Partial<PassLike> = {}): PassLike => ({
  id: 'pp',
  network: 'priority-pass',
  freeVisits: 10,
  usedBefore: 4,
  renewsOn: '2027-03-31',
  extraVisitCents: 3500,
  currency: 'EUR',
  createdAt: '2026-10-01T10:00:00Z',
  ...over,
});

const visit = (enteredAt: string, over: Partial<VisitLike> = {}): VisitLike => ({
  passId: 'pp',
  way: 'pass',
  enteredAt,
  deletedAt: null,
  ...over,
});

describe('membershipYearStart', () => {
  it('is the last anniversary of the renewal date', () => {
    expect(membershipYearStart('2027-03-31', '2026-10-06')).toBe('2026-03-31');
    expect(membershipYearStart('2027-03-31', '2027-04-02')).toBe('2027-03-31');
    expect(membershipYearStart('2027-03-31', '2027-03-31')).toBe('2027-03-31');
    expect(membershipYearStart(null, '2026-10-06')).toBeNull();
  });
});

describe('visits left', () => {
  it('counts what was typed plus the pass visits logged since', () => {
    const visits = [visit('2026-10-03T08:00:00Z'), visit('2026-10-04T08:00:00Z', { way: 'status', passId: null })];
    expect(visitsUsed(pass(), visits, '2026-10-06')).toBe(5);
    expect(visitsLeft(pass(), visits, '2026-10-06')).toBe(5);
  });

  it('ignores undone visits and last year', () => {
    const visits = [visit('2026-10-03T08:00:00Z', { deletedAt: '2026-10-03T08:01:00Z' }), visit('2026-02-01T08:00:00Z')];
    expect(visitsLeft(pass(), visits, '2026-10-06')).toBe(6);
  });

  it('starts over in a new membership year', () => {
    // Added in October 2026 with 4 used; on 1 Apr 2027 the year has renewed.
    expect(visitsLeft(pass(), [visit('2026-10-03T08:00:00Z')], '2027-04-01')).toBe(10);
  });

  it('is null for unlimited passes and never negative', () => {
    expect(visitsLeft(pass({ freeVisits: null }), [], '2026-10-06')).toBeNull();
    expect(visitsLeft(pass({ usedBefore: 12 }), [], '2026-10-06')).toBe(0);
  });

  it('warns from two left', () => {
    expect([runningLow(3), runningLow(2), runningLow(0), runningLow(null)]).toEqual([false, true, true, false]);
    expect([visitsLeftLabel(1), visitsLeftLabel(5), visitsLeftLabel(null)]).toEqual([
      '1 free visit left',
      '5 free visits left',
      'Unlimited visits',
    ]);
  });
});

describe('enginePass', () => {
  const plaza: Lounge = {
    loungeId: 'hel-plaza',
    airport: 'HEL',
    name: 'Plaza Premium Lounge',
    terminal: null,
    location: null,
    afterPassportControl: true,
    hours: null,
    access: { networks: ['priority-pass'] },
    checkedOn: '2026-10-06',
    source: 'https://example.com',
  };
  const departure = {
    airport: 'HEL',
    carrier: 'AY',
    cabin: null,
    terminal: null,
    crossesBorder: true,
    international: true,
    departsLocal: '16:40',
  };

  it('feeds the engine: a visit while free ones last, then the fee', () => {
    const left = enginePass(pass(), [], '2026-10-06')!;
    expect(left).toEqual({ id: 'pp', network: 'priority-pass', visitsLeft: 6, extraVisit: { amount: 3500, currency: 'EUR' } });
    expect(loungeOptions([plaza], departure, [], [left], '2026-10')[0].verdict).toBe('visit');
    const usedUp = enginePass(pass({ usedBefore: 10 }), [], '2026-10-06')!;
    expect(loungeOptions([plaza], departure, [], [usedUp], '2026-10')[0]).toMatchObject({ verdict: 'pay', fix: 'free-visits-used' });
  });

  it('knows the networks by id', () => {
    expect(networkInfo('priority-pass')?.name).toBe('Priority Pass');
    expect(enginePass(pass({ network: 'unknown' }), [], '2026-10-06')).toBeNull();
  });
});
