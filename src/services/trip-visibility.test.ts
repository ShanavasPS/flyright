import { audienceLine, flagsFor, visibilityChip, visibilityOf } from './trip-visibility';
import { audienceOf, audienceRank, maySee } from '../../convex/audience';

describe('trip visibility flags', () => {
  it('round-trips through the two row flags', () => {
    for (const v of ['circle', 'close', 'private'] as const) {
      expect(visibilityOf(flagsFor(v))).toBe(v);
      expect(audienceOf(flagsFor(v))).toBe(v);
    }
  });

  it('reads rows from before either flag as visible to the whole circle', () => {
    expect(visibilityOf({})).toBe('circle');
    expect(audienceOf({})).toBe('circle');
  });

  it('lets private win when both flags are set', () => {
    expect(visibilityOf({ hiddenFromCircle: false, privateTrip: true })).toBe('private');
  });
});

describe('maySee', () => {
  it('admits everyone to a circle trip, close members to a close trip, nobody to a private one', () => {
    expect(maySee(flagsFor('circle'), false)).toBe(true);
    expect(maySee(flagsFor('close'), false)).toBe(false);
    expect(maySee(flagsFor('close'), true)).toBe(true);
    expect(maySee(flagsFor('private'), true)).toBe(false);
  });

  it('ranks narrower audiences higher', () => {
    expect(audienceRank('circle')).toBeLessThan(audienceRank('close'));
    expect(audienceRank('close')).toBeLessThan(audienceRank('private'));
  });
});

describe('copy', () => {
  it('says who gets the heads-up for each level', () => {
    const followers = [
      { name: 'Sam Berg', close: true },
      { name: 'Anna', close: false },
    ];
    expect(audienceLine('circle', followers)).toBe('Sam & Anna will see it and get a heads-up.');
    expect(audienceLine('close', followers)).toBe('Sam will see it and get a heads-up.');
    expect(audienceLine('private', followers)).toMatch(/^Nobody else/);
    expect(audienceLine('close', [{ name: 'Sam', close: false }])).toMatch(/close circle yet/);
    expect(audienceLine('circle', [])).toMatch(/Nobody follows you yet/);
  });

  it('chips the non-default levels only', () => {
    expect(visibilityChip('circle')).toBeNull();
    expect(visibilityChip('close')).toBe('Close circle only');
    expect(visibilityChip('private')).toBe('Only you');
  });
});
