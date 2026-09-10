import { classifySignOut, EXPIRY_GRACE_MS } from './session-expiry';

const DAY_MS = 24 * 3_600_000;
const now = Date.parse('2026-09-10T12:00:00Z');
const record = (expireAt: number) => ({ id: 'sess_1', email: 'a@b.c', expireAt });

describe('classifySignOut', () => {
  it('a session past its expiry ran out on its own', () => {
    expect(classifySignOut(record(now - DAY_MS), now)).toBe('expired');
    expect(classifySignOut(record(now), now)).toBe('expired');
  });

  it('a sign-out just before the stamped expiry still counts as expired', () => {
    expect(classifySignOut(record(now + EXPIRY_GRACE_MS), now)).toBe('expired');
  });

  it('a session with time left was ended on purpose', () => {
    expect(classifySignOut(record(now + EXPIRY_GRACE_MS + 1), now)).toBe('deliberate');
    expect(classifySignOut(record(now + 300 * DAY_MS), now)).toBe('deliberate');
  });
});
