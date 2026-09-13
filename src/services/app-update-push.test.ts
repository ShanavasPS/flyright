import { storeVersion, updatePushPayload } from '../../convex/appUpdateShared';
import { inboxPushOptions } from '../../convex/onesignal';

it('announces only a confirmed store version, not submitted release notes', () => {
  expect(storeVersion({ latest: null, notes: [{ version: '1.0.99' }] })).toBeNull();
  expect(storeVersion({ latest: { version: '1.0.32' } })).toBe('1.0.32');
  for (const version of ['pending', '1..2', '', null, 32]) {
    expect(storeVersion({ latest: { version } })).toBeNull();
  }
});

it.each(['ios', 'android'] as const)('targets only older %s subscriptions, including anonymous opted-in installs', (platform) => {
  const payload = updatePushPayload(platform, '1.0.33', 'uuid');
  expect(payload.filters).toEqual([{ field: 'app_version', relation: '<', value: '1.0.33' }]);
  expect(payload.isIos).toBe(platform === 'ios');
  expect(payload.isAndroid).toBe(platform === 'android');
  expect(payload).not.toHaveProperty('include_aliases');
  expect(payload.ios_badgeCount).toBe(1);
  expect(payload.idempotency_key).toBe('uuid');
  expect(payload.android_group).toBe('flyright-attention-update');
});

it('never clears an available-update indicator with a delayed People push', () => {
  expect(inboxPushOptions('https://getflyright.com/people', 0)).not.toHaveProperty('ios_badgeCount');
  expect(inboxPushOptions('https://getflyright.com/people', 3)).toMatchObject({ ios_badgeType: 'SetTo', ios_badgeCount: 1 });
});

it('groups only inbox notifications so dismissing read activity cannot cancel flight alerts', () => {
  expect(inboxPushOptions('https://getflyright.com/person/sam/trip/flight')).toEqual({});
  expect(inboxPushOptions('https://getflyright.com/people', 1)).toMatchObject({ android_group: 'flyright-attention-people' });
  expect(inboxPushOptions('https://getflyright.com/support/thread', 1)).toMatchObject({ android_group: 'flyright-attention-support' });
});
