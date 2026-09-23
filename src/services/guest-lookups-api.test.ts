import { GET } from '../app/api/flight-status+api';
import { beginLookup, identifyCaller, providerCall, recordLookup } from '@/server/lookup-gate';

jest.mock('@/server/lookup-gate', () => ({
  beginLookup: jest.fn(), identifyCaller: jest.fn(), providerCall: jest.fn(), recordLookup: jest.fn(),
}));

const request = (inbound = false) => new Request(
  `https://getflyright.com/api/flight-status?flight=AY1331&date=2026-09-14${inbound ? '&inbound=1' : ''}`,
  { headers: { 'X-FlyRight-Guest': '1' } },
);
const originalKey = process.env.AERODATABOX_API_KEY;

beforeEach(() => {
  jest.resetAllMocks();
  process.env.AERODATABOX_API_KEY = 'fixture';
  jest.mocked(identifyCaller).mockResolvedValue({ ok: true, subject: { kind: 'anonymous', address: 'hash' } });
  jest.mocked(recordLookup).mockResolvedValue(undefined);
});

afterAll(() => {
  if (originalKey === undefined) delete process.env.AERODATABOX_API_KEY;
  else process.env.AERODATABOX_API_KEY = originalKey;
});

it('tells a guest to sign in when the server refuses the daily allowance', async () => {
  jest.mocked(beginLookup).mockResolvedValue({ outcome: 'refused', pro: false, reason: 'quota', level: 'full', limit: 5 });
  const response = await GET(request());
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ error: 'guest_quota_exceeded' });
  expect(providerCall).not.toHaveBeenCalled();
});

it('keeps signed-in daily exhaustion separate from the guest sign-in prompt', async () => {
  jest.mocked(identifyCaller).mockResolvedValue({ ok: true, subject: { kind: 'user', userId: 'traveller' } });
  jest.mocked(beginLookup).mockResolvedValue({ outcome: 'refused', pro: false, reason: 'quota', level: 'full', limit: 20 });
  const response = await GET(request());
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ error: 'quota_exceeded' });
  expect(providerCall).not.toHaveBeenCalled();
});

it.each([false, true])('spends one guest lookup per request, with inbound=%s', async inbound => {
  jest.mocked(beginLookup).mockResolvedValue({ outcome: 'cached', pro: false, payload: '{"flight":"AY1331"}' });
  const response = await GET(request(inbound));
  expect(beginLookup).toHaveBeenCalledWith(
    { kind: 'anonymous', address: 'hash' },
    { flight: 'AY1331', date: '2026-09-14', want: inbound ? 'inbound' : 'base', cost: 1, purpose: 'schedule' },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('x-flyright-cache')).toBe('hit');
  expect(providerCall).not.toHaveBeenCalled();
});

it('refuses guest provider calls when the durable meter is unavailable', async () => {
  jest.mocked(beginLookup).mockResolvedValue({ outcome: 'unavailable' });
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'metering_unavailable' });
  expect(providerCall).not.toHaveBeenCalled();
});

it('does not ask guests to sign in when the shared provider pool is spent', async () => {
  jest.mocked(beginLookup).mockResolvedValue({ outcome: 'refused', pro: false, reason: 'budget', level: 'exhausted', limit: 100 });
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'live_data_paused', reason: 'provider_budget' });
  expect(providerCall).not.toHaveBeenCalled();
});

it('refuses a live-monitoring request before any provider call', async () => {
  jest.mocked(beginLookup).mockResolvedValue({ outcome: 'pro_required' });
  const response = await GET(new Request(`${request().url}&purpose=monitor`));
  expect(response.status).toBe(403);
  expect(providerCall).not.toHaveBeenCalled();
});

it('sanitizes a paid cache entry for free itinerary lookups', async () => {
  jest.mocked(beginLookup).mockResolvedValue({ outcome: 'cached', pro: false, payload: JSON.stringify({ flight: 'AY1331', gate: '12', delayMinutes: 90, position: { latitude: 60 }, landed: false }) });
  const result = await (await GET(request())).json();
  expect(result.flight).toBe('AY1331');
  expect(result.delayMinutes).toBeNull();
  expect(result).not.toHaveProperty('gate');
  expect(result).not.toHaveProperty('position');
  expect(providerCall).not.toHaveBeenCalled();
});
