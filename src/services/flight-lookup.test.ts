import { getClerkInstance } from '@clerk/expo';
import { Platform } from 'react-native';
import { FlightLookupError, lookupFlight } from './flight-lookup';

jest.mock('@clerk/expo', () => ({ getClerkInstance: jest.fn() }));
jest.mock('@/services/lookup-queue', () => ({ createSerialQueue: () => (fn: () => unknown) => fn() }));

const fetchMock = jest.fn();
const originalFetch = global.fetch;
const originalPlatform = Platform.OS;

beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = fetchMock;
  jest.mocked(getClerkInstance).mockReturnValue({ session: null } as unknown as ReturnType<typeof getClerkInstance>);
});

afterEach(() => {
  global.fetch = originalFetch;
  Platform.OS = originalPlatform;
});

it.each(['ios', 'android', 'web'] as const)('identifies signed-out %s requests for the server allowance', async platform => {
  Platform.OS = platform;
  fetchMock.mockResolvedValue(Response.json({ flight: 'AY1331' }));
  await expect(lookupFlight('AY1331', '2026-09-14')).resolves.toEqual({ flight: 'AY1331' });
  expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
    headers: { [platform === 'web' ? 'X-FlyRight-Web' : 'X-FlyRight-Guest']: '1' },
  });
});

it('uses the account allowance as soon as a session is available', async () => {
  jest.mocked(getClerkInstance).mockReturnValue({
    session: { getToken: async () => 'session-token' },
  } as unknown as ReturnType<typeof getClerkInstance>);
  fetchMock.mockResolvedValue(Response.json({ flight: 'AY1331' }));
  await lookupFlight('AY1331', '2026-09-14');
  expect(fetchMock).toHaveBeenCalledWith(expect.any(String), { headers: { Authorization: 'Bearer session-token' } });
});

it('does not spend a guest lookup on an automatic background refresh', async () => {
  await expect(lookupFlight('AY1331', '2026-09-14', { background: true }))
    .rejects.toMatchObject({ signInRequired: true });
  expect(fetchMock).not.toHaveBeenCalled();
});

it('turns guest exhaustion into a sign-in action, while retaining its quota status', async () => {
  fetchMock.mockResolvedValue(Response.json({ error: 'guest_quota_exceeded' }, { status: 429 }));
  await expect(lookupFlight('AY1331', '2026-09-14')).rejects.toMatchObject({
    status: 429, code: 'guest_quota_exceeded', quotaExceeded: true, signInRequired: true,
    message: expect.stringContaining('Sign in'),
  });
});

it('does not ask signed-in callers to sign in again after spending their allowance', async () => {
  fetchMock.mockResolvedValue(Response.json({ error: 'quota_exceeded' }, { status: 429 }));
  await expect(lookupFlight('AY1331', '2026-09-14')).rejects.toMatchObject({ quotaExceeded: true, signInRequired: false });
});

it('keeps an HTML hosting error actionable without failing to parse it', async () => {
  fetchMock.mockResolvedValue(new Response('<html>Unavailable</html>', { status: 503 }));
  await expect(lookupFlight('AY1331', '2026-09-14')).rejects.toBeInstanceOf(FlightLookupError);
});
