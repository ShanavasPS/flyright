import {
  carrierCode,
  creditTip,
  earningLine,
  expiryLine,
  maskNumber,
  tierLine,
  tierProgress,
  type MembershipLike,
} from './loyalty-programmes';

function membership(over: Partial<MembershipLike>): MembershipLike {
  return {
    id: 'm1',
    programme: 'qr',
    customAirline: null,
    customProgramme: null,
    number: '1234567890',
    tier: 'Gold',
    balance: 62400,
    qualifying: 412,
    qualifyingTarget: null,
    tierUntil: '2027-03',
    expiringAmount: null,
    expiringOn: null,
    ...over,
  };
}

describe('loyalty programmes', () => {
  it('reads the carrier off a flight number', () => {
    expect(carrierCode('AY1337')).toBe('AY');
    expect(carrierCode('u2 123')).toBe('U2');
    expect(carrierCode('Train 12')).toBeNull();
  });

  it('measures progress against the next tier, the typed target winning', () => {
    expect(tierProgress(membership({}))).toEqual({
      text: '412 / 600 Qpoints',
      next: 'to Platinum',
      fraction: 412 / 600,
    });
    expect(tierProgress(membership({ qualifyingTarget: 500 }))?.text).toBe('412 / 500 Qpoints');
    // No published number for the next tier, nothing typed: no bar.
    expect(tierProgress(membership({ programme: 'ay', tier: 'Silver', qualifying: 10 }))).toBeNull();
    expect(tierProgress(membership({ qualifying: null }))).toBeNull();
  });

  it('words the tier, the expiry and the hidden number', () => {
    expect(tierLine(membership({}))).toBe('Gold until Mar 2027');
    expect(tierLine(membership({ tierUntil: null }))).toBe('Gold');
    expect(
      expiryLine(membership({ programme: 'ek', expiringAmount: 4000, expiringOn: '2026-12-31' })),
    ).toBe('4 000 Skywards Miles expire on 31 Dec 2026');
    expect(
      expiryLine(membership({ programme: 'aa', expiringAmount: 500, expiringOn: '2027-01-15' })),
    ).toBe('500 miles expire on 15 Jan 2027');
    expect(maskNumber('EK 987 654 321')).toBe('•••• 4321');
    expect(maskNumber('123')).toBe('123');
  });

  it('says how a flight earns: own airline first, then an alliance partner', () => {
    const cards = [membership({}), membership({ id: 'm2', programme: 'ek', tier: 'Silver' })];
    expect(earningLine('QR', cards)).toBe('Earns Qpoints · Privilege Club Gold');
    expect(earningLine('EK', cards)).toBe('Earns tier miles · Skywards Silver');
    expect(earningLine('AY', cards)).toBe('Can earn Qpoints · Privilege Club Gold');
    expect(earningLine('LH', cards)).toBeNull();
  });

  it('suggests crediting partner flights the traveller has no card for', () => {
    const tip = creditTip(['AY1337', 'AY1338', 'QR301', 'LH100'], [membership({})], (c) =>
      c === 'AY' ? 'Finnair' : c,
    );
    expect(tip).toEqual({
      title: 'Credit your Finnair flights',
      body: 'Finnair is oneworld, like Qatar Airways. Your 2 upcoming Finnair flights can earn Qpoints toward Privilege Club Platinum.',
      membershipId: 'm1',
    });
    expect(creditTip(['QR301'], [membership({})], (c) => c)).toBeNull();
  });
});
