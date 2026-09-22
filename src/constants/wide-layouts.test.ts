import {
  parseLayoutEnv,
  parseLayoutOverrides,
  resolveLayoutSwitches,
  WIDE_LAYOUT_DEFAULTS,
} from './wide-layouts';

describe('wide layout switches', () => {
  it('ships with every surface on and the Duo mirror off', () => {
    expect(WIDE_LAYOUT_DEFAULTS).toEqual({
      flights: true,
      claims: true,
      friends: true,
      updates: true,
      world: true,
      duoMirror: false,
    });
  });

  it('falls back to the defaults for a missing or malformed answer', () => {
    for (const raw of [undefined, null, 'on', 3, [], ['world']]) {
      expect(resolveLayoutSwitches(raw)).toEqual(WIDE_LAYOUT_DEFAULTS);
    }
  });

  it('keeps only known keys with boolean values', () => {
    expect(parseLayoutOverrides({ world: false, duoMirror: true, bogus: false, claims: 'off' })).toEqual({
      world: false,
      duoMirror: true,
    });
  });

  it('lets the server switch a surface off and the mirror on', () => {
    expect(resolveLayoutSwitches({ world: false, duoMirror: true })).toEqual({
      ...WIDE_LAYOUT_DEFAULTS,
      world: false,
      duoMirror: true,
    });
  });

  it('reads the env var, ignoring typos instead of switching things off', () => {
    expect(parseLayoutEnv('duoMirror:on, world:off,claims:maybe,wrold:off,:on,friends')).toEqual({
      duoMirror: true,
      world: false,
    });
    expect(parseLayoutEnv(undefined)).toEqual({});
    expect(parseLayoutEnv('')).toEqual({});
  });
});
