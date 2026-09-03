import { INVITE_URL, toInAppPath, watcherNames } from './circle';

describe('watcherNames', () => {
  it('names one, two, three, and many watchers by first name', () => {
    expect(watcherNames([{ name: 'Anna Berg' }])).toBe('Anna');
    expect(watcherNames([{ name: 'Anna' }, { name: 'Ben' }])).toBe('Anna & Ben');
    expect(watcherNames([{ name: 'Anna' }, { name: 'Ben' }, { name: 'Cy' }])).toBe(
      'Anna, Ben & Cy',
    );
    expect(
      watcherNames([{ name: 'Anna' }, { name: 'Ben' }, { name: 'Cy' }, { name: 'Di' }]),
    ).toBe('Anna, Ben & 2 more');
  });

  it('falls back for watchers without a profile name', () => {
    expect(watcherNames([{ name: null }, { name: '  ' }])).toBe('Someone & Someone');
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
