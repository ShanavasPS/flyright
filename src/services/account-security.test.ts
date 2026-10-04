import { activeLabel, deviceLabel, looksLikeEmail, otherSessions, placeLabel } from './account-security';

describe('account security wording', () => {
  it('names the device a session is on', () => {
    expect(deviceLabel({ browserName: 'FlyRight', browserVersion: '75', isMobile: true })).toBe('iPhone app');
    expect(deviceLabel({ browserName: 'OkHttp', browserVersion: '5.4.0', isMobile: true })).toBe('Android app');
    expect(deviceLabel({ browserName: 'Chrome', isMobile: false })).toBe('Chrome on a computer');
    expect(deviceLabel({ browserName: 'Safari', isMobile: true })).toBe('Safari on a phone');
    expect(deviceLabel(null)).toBe('A browser on a computer');
  });

  it('says where, with a country code spelled out', () => {
    expect(placeLabel({ city: 'Helsinki', country: 'Finland' })).toBe('Helsinki, Finland');
    expect(placeLabel({ city: 'Kanayannur', country: 'IN' })).toBe('Kanayannur, India');
    expect(placeLabel({ country: 'Finland' })).toBe('Finland');
    expect(placeLabel({})).toBeNull();
  });

  it('says how long ago a device was used', () => {
    const now = new Date('2026-10-04T12:00:00Z');
    const ago = (ms: number) => activeLabel(new Date(now.getTime() - ms), now);
    expect(ago(30_000)).toBe('Active now');
    expect(ago(5 * 60_000)).toBe('Active 5 min ago');
    expect(ago(3 * 3_600_000)).toBe('Active 3 h ago');
    expect(ago(30 * 3_600_000)).toBe('Active yesterday');
    expect(ago(3 * 86_400_000)).toBe('Active 3 days ago');
    expect(ago(90 * 86_400_000)).toBe('Active 3 months ago');
  });

  it('lists the other devices, latest first', () => {
    const sessions = [
      { id: 'a', lastActiveAt: new Date('2026-09-01') },
      { id: 'me', lastActiveAt: new Date('2026-10-04') },
      { id: 'b', lastActiveAt: new Date('2026-09-20') },
    ];
    expect(otherSessions(sessions, 'me').map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('checks an email before sending a code', () => {
    expect(looksLikeEmail(' maja@example.com ')).toBe(true);
    expect(looksLikeEmail('maja@example')).toBe(false);
    expect(looksLikeEmail('maja example.com')).toBe(false);
  });
});
