import { CLAIM_CHANNELS, claimChannelFor } from './carrier-claims';
import { CARRIERS } from './carriers';

describe('claim channels', () => {
  it('resolves by flight-number prefix, alias, or carrier name', () => {
    expect(claimChannelFor('LH873')?.formUrl).toContain('lufthansa.com');
    expect(claimChannelFor('rk1234')).toBe(CLAIM_CHANNELS.FR);
    expect(claimChannelFor('', 'Finnair')).toBe(CLAIM_CHANNELS.AY);
    expect(claimChannelFor('ZZ100', 'Nowhere Air')).toBeNull();
  });

  it('never offers the composer for an airline that bins emailed claims', () => {
    for (const channel of Object.values(CLAIM_CHANNELS)) {
      if (channel.emailRefused) expect(channel.email).toBeUndefined();
      expect(channel.formUrl ?? channel.email).toBeTruthy();
      expect(channel.formUrl).toMatch(/^https:\/\//);
    }
  });

  it('knows the country of every carrier it has a channel for', () => {
    for (const iata of Object.keys(CLAIM_CHANNELS)) expect(CARRIERS[iata]?.country).toBeTruthy();
  });
});
