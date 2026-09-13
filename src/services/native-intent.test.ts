import { redirectSystemPath } from '@/app/+native-intent';
import { registerInboxDocument } from '@/services/document-imports';

jest.mock('@/constants/config', () => ({
  DETOUR_API_KEY: 'test-key',
  DETOUR_APP_ID: 'test-app',
}));
jest.mock('@/services/document-imports', () => ({
  registerInboxDocument: jest.fn(() => 'document-handle'),
}));

const BASE = 'https://flyright.godetour.link/0tItTZgtyO';
const fetchMock = jest.spyOn(globalThis, 'fetch');

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockResolvedValue(response({ allowed: true }));
});

afterAll(() => fetchMock.mockRestore());

describe.each([true, false])('native intent (initial=%s)', (initial) => {
  it.each(['i/invite_123', 't/trip_123'])('opens the destination %s', async (destination) => {
    expect(await redirectSystemPath({ path: `${BASE}/${destination}?campaign=share`, initial }))
      .toBe(`/${destination}`);
  });

  it.each([
    'https://getflyright.com/i/invite_123',
    'flyright://journey/journey_123',
    '/settings',
    'https://other.godetour.link/hash/i/tok',
  ])('leaves other incoming links unchanged: %s', async (path) => {
    expect(await redirectSystemPath({ path, initial })).toBe(path);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it.each([
  [`${BASE}/i/invite_123`, '/i/invite_123'],
  ['https://getflyright.com/t/trip_123', '/t/trip_123'],
  ['flyright://i/invite_123', '/i/invite_123'],
  ['/i/invite_123?campaign=share', '/i/invite_123'],
  ['/settings', '/'],
  ['https://example.com/i/invite_123', '/'],
])('resolves a short link to an allowed destination: %s', async (link, expected) => {
  fetchMock.mockImplementation(async (input) => response(
    String(input).endsWith('/resolve-short') ? { link } : { allowed: true },
  ));
  expect(await redirectSystemPath({ path: 'https://flyright.godetour.link/short123', initial: true }))
    .toBe(expected);
});

it('opens home for a base link, an unresolved short link, or an unsupported screen', async () => {
  fetchMock.mockImplementation(async (input) => String(input).endsWith('/resolve-short')
    ? response({}, 404)
    : response({ allowed: true }));
  for (const path of [BASE, 'https://flyright.godetour.link/missing', `${BASE}/settings`]) {
    expect(await redirectSystemPath({ path, initial: true })).toBe('/');
  }
});

it('keeps full links usable when the click request fails', async () => {
  fetchMock.mockRejectedValue(new Error('Offline'));
  expect(await redirectSystemPath({ path: `${BASE}/t/trip_123`, initial: true })).toBe('/t/trip_123');
});

it('still registers shared PDFs and routes with an opaque handle', async () => {
  const path = 'file:///Documents/Inbox/ticket.pdf';
  expect(await redirectSystemPath({ path, initial: true })).toBe('/import-document?handle=document-handle');
  expect(registerInboxDocument).toHaveBeenCalledWith(path);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('keeps rejected file imports on the import screen', async () => {
  jest.mocked(registerInboxDocument).mockImplementationOnce(() => { throw new Error('Invalid file'); });
  expect(await redirectSystemPath({ path: 'file:///private/not-an-inbox.pdf', initial: true }))
    .toBe('/import-document');
});
