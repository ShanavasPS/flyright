import { STORE_URLS } from '@/constants/store-links';

import { deferrablePath, storeLink } from './deferred-links';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1';
const PIXEL =
  'Mozilla/5.0 (Linux; Android 16; Pixel 9a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const BASE = 'https://flyright.godetour.link/abc123';

describe('deferrablePath', () => {
  it('accepts invite and trip share paths, with or without a query', () => {
    expect(deferrablePath('/i/tok_9X-y')).toBe('/i/tok_9X-y');
    expect(deferrablePath('/t/abc?fromDeepLink=true')).toBe('/t/abc');
  });

  it('rejects everything else', () => {
    expect(deferrablePath('/')).toBeNull();
    expect(deferrablePath('/settings')).toBeNull();
    expect(deferrablePath('/i/')).toBeNull();
    expect(deferrablePath('/i/a/b')).toBeNull();
    expect(deferrablePath('/paywall?next=/people')).toBeNull();
  });
});

describe('storeLink', () => {
  it('routes the matching phone through Detour', () => {
    expect(storeLink('ios', '/i/tok', { base: BASE, userAgent: IPHONE })).toBe(`${BASE}/i/tok`);
    expect(storeLink('android', '/t/tok', { base: `${BASE}/`, userAgent: PIXEL })).toBe(
      `${BASE}/t/tok`,
    );
  });

  it('falls back to the listing off-platform, on desktop, or unconfigured', () => {
    expect(storeLink('ios', '/i/tok', { base: BASE, userAgent: PIXEL })).toBe(STORE_URLS.ios);
    expect(storeLink('android', '/i/tok', { base: BASE, userAgent: IPHONE })).toBe(
      STORE_URLS.android,
    );
    expect(storeLink('ios', '/i/tok', { base: BASE, userAgent: MAC })).toBe(STORE_URLS.ios);
    expect(storeLink('ios', '/i/tok', { base: '', userAgent: IPHONE })).toBe(STORE_URLS.ios);
    expect(storeLink('ios', '/settings', { base: BASE, userAgent: IPHONE })).toBe(STORE_URLS.ios);
  });
});
