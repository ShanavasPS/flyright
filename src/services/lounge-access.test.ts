import { loungeOptions, type Lounge, type LoungeDeparture, type LoungePass, type StatusEvidence } from './lounge-access';
import { type MembershipLike } from './loyalty-programmes';

const PLATINUM_WING: Lounge = {
  loungeId: 'hel-platinum-wing',
  airport: 'HEL',
  name: 'Finnair Platinum Wing',
  terminal: null,
  location: null,
  afterPassportControl: true,
  hours: { open: '05:00', close: '01:00' },
  access: {
    cabin: { cabins: ['business', 'first'], alliance: 'oneworld' },
    status: { alliance: 'oneworld', levels: ['emerald'] },
  },
  checkedOn: '2026-10-06',
  source: 'https://example.com',
};

const BUSINESS_LOUNGE: Lounge = {
  ...PLATINUM_WING,
  loungeId: 'hel-business',
  name: 'Finnair Lounge',
  access: {
    cabin: { cabins: ['business', 'first'], alliance: 'oneworld' },
    status: { alliance: 'oneworld', levels: ['sapphire', 'emerald'] },
  },
};

const PLAZA: Lounge = {
  loungeId: 'hel-plaza',
  airport: 'HEL',
  name: 'Plaza Premium Lounge',
  terminal: null,
  location: null,
  afterPassportControl: true,
  hours: { open: '06:00', close: '22:00' },
  access: { networks: ['priority-pass'], door: { amount: 4500, currency: 'EUR' } },
  checkedOn: '2026-10-06',
  source: 'https://example.com',
};

const STAR_LOUNGE: Lounge = {
  loungeId: 'fra-senator',
  airport: 'FRA',
  name: 'Lufthansa Senator Lounge',
  terminal: '1',
  location: null,
  afterPassportControl: null,
  hours: null,
  access: { status: { alliance: 'Star Alliance', levels: ['star-gold'], internationalOnly: true } },
  checkedOn: '2026-10-06',
  source: 'https://example.com',
};

const departure = (over: Partial<LoungeDeparture> = {}): LoungeDeparture => ({
  airport: 'HEL',
  carrier: 'AY',
  cabin: 'economy',
  terminal: null,
  crossesBorder: true,
  international: true,
  departsLocal: '16:40',
  ...over,
});

const membership = (over: Partial<MembershipLike> = {}): MembershipLike => ({
  id: 'ay',
  programme: 'ay',
  customAirline: null,
  customProgramme: null,
  number: '600123454821',
  tier: 'Platinum',
  balance: null,
  qualifying: null,
  qualifyingTarget: null,
  tierUntil: '2027-03',
  expiringAmount: null,
  expiringOn: null,
  ...over,
});

const status = (over: Partial<MembershipLike> = {}, onBooking: boolean | null = true): StatusEvidence => ({
  membership: membership(over),
  onBooking,
});

const priorityPass = (visitsLeft: number | null): LoungePass => ({
  id: 'pp',
  network: 'priority-pass',
  visitsLeft,
  extraVisit: { amount: 3500, currency: 'EUR' },
});

const verdicts = (options: ReturnType<typeof loungeOptions>) =>
  options.map((o) => [o.lounge.name, o.verdict, o.fix]);

const MONTH = '2026-10';

describe('loungeOptions', () => {
  it('lets status in when the member number is on the booking', () => {
    const options = loungeOptions([PLATINUM_WING], departure(), [status()], [], MONTH);
    expect(options[0]).toMatchObject({
      verdict: 'included',
      way: { kind: 'status', membershipId: 'ay', level: 'emerald' },
    });
  });

  it('is only likely when the boarding pass has not been read', () => {
    expect(verdicts(loungeOptions([PLATINUM_WING], departure(), [status({}, null)], [], MONTH))).toEqual([
      ['Finnair Platinum Wing', 'likely', 'booking-not-read'],
    ]);
  });

  it('asks for the number when the pass carries none', () => {
    expect(verdicts(loungeOptions([PLATINUM_WING], departure(), [status({}, false)], [], MONTH))).toEqual([
      ['Finnair Platinum Wing', 'likely', 'number-not-on-booking'],
    ]);
  });

  it('flags a tier that may have ended', () => {
    expect(verdicts(loungeOptions([PLATINUM_WING], departure(), [status({ tierUntil: '2026-03' })], [], MONTH))).toEqual([
      ['Finnair Platinum Wing', 'likely', 'status-may-have-ended'],
    ]);
  });

  it('needs the right alliance level and an alliance flight', () => {
    const gold = [status({ tier: 'Gold' })];
    expect(loungeOptions([PLATINUM_WING], departure(), gold, [], MONTH)[0].verdict).toBe('no');
    expect(loungeOptions([BUSINESS_LOUNGE], departure(), gold, [], MONTH)[0].verdict).toBe('included');
    expect(loungeOptions([BUSINESS_LOUNGE], departure({ carrier: 'LH' }), gold, [], MONTH)[0].verdict).toBe('no');
  });

  it('lets a business ticket in on any alliance member', () => {
    const options = loungeOptions([BUSINESS_LOUNGE], departure({ carrier: 'BA', cabin: 'business' }), [], [], MONTH);
    expect(options[0]).toMatchObject({ verdict: 'included', way: { kind: 'cabin', cabin: 'business' } });
  });

  it('prefers a free way in over a pass visit', () => {
    const options = loungeOptions([BUSINESS_LOUNGE, PLAZA], departure(), [status()], [priorityPass(6)], MONTH);
    expect(verdicts(options)).toEqual([
      ['Finnair Lounge', 'included', null],
      ['Plaza Premium Lounge', 'visit', null],
    ]);
  });

  it('charges the pass fee once the free visits are used, else the door price', () => {
    expect(loungeOptions([PLAZA], departure(), [], [priorityPass(0)], MONTH)[0]).toMatchObject({
      verdict: 'pay',
      fix: 'free-visits-used',
      way: { kind: 'pay', price: { amount: 3500 }, passId: 'pp' },
    });
    expect(loungeOptions([PLAZA], departure(), [], [], MONTH)[0]).toMatchObject({
      verdict: 'pay',
      way: { kind: 'pay', price: { amount: 4500 }, passId: null },
    });
  });

  it('counts an unlimited pass as a visit', () => {
    expect(loungeOptions([PLAZA], departure(), [], [priorityPass(null)], MONTH)[0].verdict).toBe('visit');
  });

  it('says closed when the lounge shuts before the last hour', () => {
    // Closes 22:00; departing 22:30 means a visit at 21:30 still works,
    // departing 23:30 doesn't.
    expect(loungeOptions([PLAZA], departure({ departsLocal: '22:30' }), [], [priorityPass(3)], MONTH)[0].verdict).toBe('visit');
    expect(loungeOptions([PLAZA], departure({ departsLocal: '23:30' }), [], [priorityPass(3)], MONTH)[0]).toMatchObject({
      verdict: 'closed',
      fix: 'closed-at-departure',
    });
  });

  it('handles hours past midnight', () => {
    // Open 05:00–01:00: a 00:50 departure (visit at 23:50) is fine, a
    // 05:30 departure (visit at 04:30) is not.
    expect(loungeOptions([PLATINUM_WING], departure({ departsLocal: '00:50' }), [status()], [], MONTH)[0].verdict).toBe('included');
    expect(loungeOptions([PLATINUM_WING], departure({ departsLocal: '05:30' }), [status()], [], MONTH)[0].verdict).toBe('closed');
  });

  it('leaves out lounges the traveller cannot reach', () => {
    const schengen = departure({ crossesBorder: false });
    expect(loungeOptions([PLATINUM_WING], schengen, [status()], [], MONTH)[0]).toMatchObject({
      verdict: 'no',
      fix: 'past-passport-control',
    });
    const t2 = departure({ airport: 'FRA', carrier: 'LH', terminal: '2' });
    expect(loungeOptions([STAR_LOUNGE], t2, [status({ programme: 'lh', tier: 'Senator' })], [], MONTH)[0].fix).toBe('other-terminal');
  });

  it('counts Star Alliance Gold on international flights only', () => {
    const senator = [status({ programme: 'lh', tier: 'Senator' })];
    const fra = departure({ airport: 'FRA', carrier: 'LH', terminal: '1' });
    expect(loungeOptions([STAR_LOUNGE], fra, senator, [], MONTH)[0].verdict).toBe('included');
    expect(loungeOptions([STAR_LOUNGE], { ...fra, international: false }, senator, [], MONTH)[0].verdict).toBe('no');
  });

  it('only lists lounges at the departure airport', () => {
    expect(loungeOptions([PLATINUM_WING, STAR_LOUNGE], departure(), [status()], [], MONTH)).toHaveLength(1);
  });

  it('ignores a tier the catalogue does not know', () => {
    expect(loungeOptions([PLATINUM_WING], departure(), [status({ tier: 'Diamond' })], [], MONTH)[0].verdict).toBe('no');
  });
});
