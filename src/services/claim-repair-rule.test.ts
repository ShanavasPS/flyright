import { needsIntraEuCap, type RepairCandidate } from './claim-repair-rule';

const claim = (over: Partial<RepairCandidate> = {}): RepairCandidate => ({
  regulation: 'EU261',
  currency: 'EUR',
  amount: 600,
  status: 'sent',
  fromCountry: 'FI',
  toCountry: 'ES',
  distanceKm: 4700,
  ...over,
});

describe('needsIntraEuCap', () => {
  it('flags a 600 EUR claim on a long intra-EU flight (Helsinki–Tenerife)', () => {
    expect(needsIntraEuCap(claim())).toBe(true);
  });

  it('flags the halved 300 EUR the old engine gave a 3–4 h delay', () => {
    expect(needsIntraEuCap(claim({ amount: 300 }))).toBe(true);
  });

  it('counts the outermost regions and the EEA as intra-EU', () => {
    expect(needsIntraEuCap(claim({ fromCountry: 'FR', toCountry: 'RE', distanceKm: 9360 }))).toBe(true);
    expect(needsIntraEuCap(claim({ fromCountry: 'NO', toCountry: 'ES', distanceKm: 4000 }))).toBe(true);
  });

  it('flags every open status', () => {
    for (const status of ['draft', 'sent', 'acknowledged', 'escalated'] as const) {
      expect(needsIntraEuCap(claim({ status }))).toBe(true);
    }
  });

  it('leaves paid and rejected claims as they were', () => {
    expect(needsIntraEuCap(claim({ status: 'paid' }))).toBe(false);
    expect(needsIntraEuCap(claim({ status: 'rejected' }))).toBe(false);
  });

  it('leaves correct amounts and flights leaving the EU alone', () => {
    expect(needsIntraEuCap(claim({ amount: 400 }))).toBe(false);
    expect(needsIntraEuCap(claim({ amount: 250, distanceKm: 1200 }))).toBe(false);
    expect(needsIntraEuCap(claim({ toCountry: 'US', distanceKm: 6600 }))).toBe(false);
    expect(needsIntraEuCap(claim({ fromCountry: 'AE', toCountry: 'DE' }))).toBe(false);
  });

  it('leaves UK261 (GBP) claims and other regulations alone', () => {
    expect(needsIntraEuCap(claim({ regulation: 'UK261', currency: 'GBP', amount: 520 }))).toBe(false);
    expect(needsIntraEuCap(claim({ regulation: 'EU Rail 2021/782' }))).toBe(false);
  });

  it('ignores short flights even with a stray 600', () => {
    expect(needsIntraEuCap(claim({ distanceKm: 1400 }))).toBe(false);
  });
});
