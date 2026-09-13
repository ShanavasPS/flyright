import { check, prepare, markSent } from '../../convex/appUpdates';

type Row = {
  _id: string; _creationTime: number; platform: 'ios' | 'android'; version: string;
  idempotencyKey: string; lastAttemptAt: number; sentAt: number | null; notificationId: string | null;
};
type PrepareArgs = Pick<Row, 'platform' | 'version' | 'idempotencyKey'>;
const prepareHandler = (prepare as unknown as { _handler: (ctx: unknown, args: PrepareArgs) => Promise<Row | null> })._handler;
const sentHandler = (markSent as unknown as { _handler: (ctx: unknown, args: { id: string; notificationId: string }) => Promise<void> })._handler;
const checkHandler = (check as unknown as { _handler: (ctx: unknown, args: object) => Promise<void> })._handler;
const NOW = Date.parse('2026-09-13T10:00:00Z');

function database() {
  let row: Row | null = null;
  return {
    db: {
      query: () => ({ withIndex: () => ({ unique: async () => row }) }),
      insert: async (_table: string, value: Omit<Row, '_id' | '_creationTime'>) => {
        row = { ...value, _id: 'announcement', _creationTime: NOW }; return row._id;
      },
      get: async () => row,
      patch: async (_id: string, patch: Partial<Row>) => { row = { ...row!, ...patch }; },
    },
  };
}

afterEach(() => jest.restoreAllMocks());

it('reuses the persisted idempotency key after a failed send and blocks overlapping attempts', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  const ctx = database();
  const args: PrepareArgs = { platform: 'ios', version: '1.0.33', idempotencyKey: 'first-key' };
  expect(await prepareHandler(ctx, args)).toMatchObject({ idempotencyKey: 'first-key' });
  expect(await prepareHandler(ctx, { ...args, idempotencyKey: 'overlapping-key' })).toBeNull();
  now.mockReturnValue(NOW + 15 * 60_000);
  expect(await prepareHandler(ctx, { ...args, idempotencyKey: 'retry-key' })).toMatchObject({ idempotencyKey: 'first-key' });
});

it('never resends a completed announcement, including one with no matching subscribers', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  const ctx = database();
  const args: PrepareArgs = { platform: 'ios', version: '1.0.33', idempotencyKey: 'key' };
  await prepareHandler(ctx, args);
  await sentHandler(ctx, { id: 'announcement', notificationId: '' });
  now.mockReturnValue(NOW + 86400_000);
  expect(await prepareHandler(ctx, args)).toBeNull();
});

it('does not reuse an idempotency key after the provider deduplication window', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  const ctx = database();
  const args: PrepareArgs = { platform: 'ios', version: '1.0.33', idempotencyKey: 'key' };
  await prepareHandler(ctx, args);
  now.mockReturnValue(NOW + 30 * 86400_000);
  expect(await prepareHandler(ctx, args)).toBeNull();
});

describe('store polling', () => {
  const originalFetch = global.fetch;
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const originalEnabled = process.env.APP_UPDATE_PUSH_ENABLED;
  const originalAppId = process.env.ONESIGNAL_APP_ID;
  const originalApiKey = process.env.ONESIGNAL_REST_API_KEY;

  beforeEach(() => {
    process.env.APP_UPDATE_PUSH_ENABLED = 'true';
    process.env.ONESIGNAL_APP_ID = 'test-app';
    process.env.ONESIGNAL_REST_API_KEY = 'test-key';
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => 'new-key' } });
  });
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
    else Reflect.deleteProperty(globalThis, 'crypto');
    for (const [key, value] of Object.entries({
      APP_UPDATE_PUSH_ENABLED: originalEnabled, ONESIGNAL_APP_ID: originalAppId, ONESIGNAL_REST_API_KEY: originalApiKey,
    })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  it('makes no requests on a development deployment without explicit enablement', async () => {
    delete process.env.APP_UPDATE_PUSH_ENABLED;
    global.fetch = jest.fn();
    await checkHandler({}, {});
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not queue or send when a store has no confirmed version', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ latest: null }) });
    const runMutation = jest.fn();
    await checkHandler({ runMutation }, {});
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it('uses the saved key for delivery and retries an upstream failure without marking success', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ latest: { version: '1.0.33' } }) })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ latest: null }) });
    const runMutation = jest.fn().mockResolvedValue({ _id: 'announcement', idempotencyKey: 'persisted-key' });
    await checkHandler({ runMutation }, {});
    expect(runMutation).toHaveBeenCalledTimes(1);
    const body = JSON.parse(jest.mocked(global.fetch).mock.calls[1][1]!.body as string);
    expect(body.idempotency_key).toBe('persisted-key');
    expect(body.isIos).toBe(true);
    expect(body.isAndroid).toBe(false);
    expect(warning).toHaveBeenCalled();
  });
});
