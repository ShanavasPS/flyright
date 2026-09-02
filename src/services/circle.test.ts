import { followingLabel, INVITE_URL, toInAppPath } from './circle';

describe('followingLabel', () => {
  it('names one, two, and many followers', () => {
    expect(followingLabel([])).toBe('Share live');
    expect(followingLabel([{ name: 'Anna' }])).toBe('Anna following');
    expect(followingLabel([{ name: 'Anna' }, { name: 'Ben' }])).toBe('Anna & Ben following');
    expect(followingLabel([{ name: 'Anna' }, { name: 'Ben' }, { name: 'Cy' }])).toBe(
      'Anna +2 following',
    );
  });

  it('falls back for followers without a profile name', () => {
    expect(followingLabel([{ name: null }])).toBe('Someone following');
  });
});

describe('toInAppPath', () => {
  it('strips the web origin from push links', () => {
    expect(toInAppPath('https://getflyright.com/t/abc')).toBe('/t/abc');
    expect(toInAppPath('https://www.getflyright.com/people')).toBe('/people');
    expect(toInAppPath('/journey/x')).toBe('/journey/x');
    expect(toInAppPath('people')).toBe('/people');
  });

  it('round-trips an invite url', () => {
    expect(toInAppPath(INVITE_URL('tok'))).toBe('/i/tok');
  });
});
