import {
  entitlementChange,
  NEVER_EXPIRES,
  proActive,
  proUntilFromSubscriber,
  type RevenueCatEvent,
} from '../../convex/entitlementShared';

const base: RevenueCatEvent = {
  type: 'INITIAL_PURCHASE',
  app_user_id: 'user_clerk',
  aliases: ['$RCAnonymousID:abc', 'user_clerk'],
  entitlement_ids: ['Owed Pro'],
  expiration_at_ms: Date.UTC(2027, 0, 1),
};

describe('entitlementChange', () => {
  it('grants Pro to every alias until the expiration', () => {
    expect(entitlementChange(base)).toEqual({
      userIds: ['user_clerk', '$RCAnonymousID:abc'],
      proUntil: '2027-01-01T00:00:00.000Z',
    });
  });

  it('treats a lifetime purchase (no expiration) as never expiring', () => {
    const change = entitlementChange({
      ...base,
      type: 'NON_RENEWING_PURCHASE',
      expiration_at_ms: null,
    });
    expect(change?.proUntil).toBe(NEVER_EXPIRES);
  });

  it('keeps Pro through a cancellation until the period ends', () => {
    expect(entitlementChange({ ...base, type: 'CANCELLATION' })?.proUntil).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });

  it('ends Pro on expiration', () => {
    const at = Date.UTC(2026, 8, 3);
    const change = entitlementChange({ ...base, type: 'EXPIRATION', expiration_at_ms: at });
    expect(change?.proUntil).toBe(new Date(at).toISOString());
    expect(proActive(change!.proUntil, at + 1)).toBe(false);
  });

  it('revokes the transferring side of a TRANSFER and grants nobody', () => {
    expect(
      entitlementChange({
        type: 'TRANSFER',
        app_user_id: 'user_new',
        transferred_from: ['user_old'],
        transferred_to: ['user_new'],
      }),
    ).toEqual({ userIds: ['user_old'], proUntil: null });
  });

  it('ignores other entitlements and TEST pings', () => {
    expect(entitlementChange({ ...base, entitlement_ids: ['Something Else'] })).toBeNull();
    expect(entitlementChange({ type: 'TEST', app_user_id: 'x', entitlement_ids: ['Owed Pro'] })).toBeNull();
  });
});

describe('proActive', () => {
  it('is false for null and past dates, true for future ones', () => {
    const now = Date.UTC(2026, 8, 3);
    expect(proActive(null, now)).toBe(false);
    expect(proActive('2026-09-02T00:00:00.000Z', now)).toBe(false);
    expect(proActive('2026-09-04T00:00:00.000Z', now)).toBe(true);
    expect(proActive(NEVER_EXPIRES, now)).toBe(true);
  });
});

describe('proUntilFromSubscriber', () => {
  it('reads the Pro expiry, lifetime as never, and missing as null', () => {
    expect(
      proUntilFromSubscriber({ entitlements: { 'Owed Pro': { expires_date: '2027-01-01T00:00:00Z' } } }),
    ).toBe('2027-01-01T00:00:00Z');
    expect(proUntilFromSubscriber({ entitlements: { 'Owed Pro': { expires_date: null } } })).toBe(
      NEVER_EXPIRES,
    );
    expect(proUntilFromSubscriber({ entitlements: {} })).toBeNull();
    expect(proUntilFromSubscriber({})).toBeNull();
  });
});
