/** The flight-path route against a stubbed provider: which endpoints it
 * calls for a flight in each state, what it answers, and what it refuses
 * to draw. Lives outside src/app so expo-router never sees it. */

import { GET } from '../app/api/flight-path+api';

const upstream = jest.fn();

const NOW = Date.parse('2026-09-15T12:00:00Z');

beforeEach(() => {
  process.env.FLIGHTAWARE_API_KEY = 'test-key';
  delete process.env.FLIGHTAWARE_HISTORY;
  upstream.mockReset();
  global.fetch = upstream as unknown as typeof fetch;
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

const request = (query: string) =>
  ({ url: `https://getflyright.com/api/flight-path?${query}` }) as Request;

const QUERY = 'flight=AY1331&date=2026-09-14&from=HEL&to=LHR&departure=2026-09-14T08:00:00Z';

const summary = (overrides: Record<string, unknown> = {}) => ({
  flights: [
    {
      fa_flight_id: 'FIN1331-1',
      ident_iata: 'AY1331',
      origin: { code_iata: 'HEL' },
      destination: { code_iata: 'LHR' },
      scheduled_out: '2026-09-14T08:00:00Z',
      actual_off: '2026-09-14T08:12:00Z',
      actual_on: '2026-09-14T10:28:00Z',
      ...overrides,
    },
  ],
});

const positions = [
  { latitude: 60.3, longitude: 24.9, timestamp: '2026-09-14T08:12:00Z', update_type: 'A' },
  { latitude: 58, longitude: 15, timestamp: '2026-09-14T09:00:00Z', update_type: 'A' },
  { latitude: 55, longitude: 5, timestamp: '2026-09-14T09:45:00Z', update_type: 'A' },
  { latitude: 51.5, longitude: -0.4, timestamp: '2026-09-14T10:28:00Z', update_type: 'A' },
];

describe('GET /api/flight-path', () => {
  it('serves the recorded track of a landed flight', async () => {
    upstream.mockResolvedValueOnce(ok(summary())).mockResolvedValueOnce(ok({ positions }));

    const response = await GET(request(QUERY));
    const body = await response.json();

    expect(upstream).toHaveBeenCalledTimes(2);
    expect(upstream.mock.calls[0][0]).toContain('/flights/AY1331?ident_type=designator&start=2026-09-13&end=2026-09-15');
    expect(upstream.mock.calls[0][1].headers['x-apikey']).toBe('test-key');
    expect(upstream.mock.calls[1][0]).toContain('/flights/FIN1331-1/track');
    expect(body.path).toMatchObject({ kind: 'track', complete: true });
    expect(body.path.points[0]).toEqual([60.3, 24.9]);
    expect(body.reason).toBeNull();
  });

  it('serves a live, incomplete track while the flight is airborne', async () => {
    upstream
      .mockResolvedValueOnce(ok(summary({ actual_on: null })))
      .mockResolvedValueOnce(ok({ positions: positions.slice(0, 2) }));

    const body = await (await GET(request(QUERY))).json();

    expect(body.path).toMatchObject({ kind: 'track', complete: false });
    expect(body.path.points).toHaveLength(2);
  });

  it('serves the filed route before departure, and nothing when it is undecodable', async () => {
    upstream
      .mockResolvedValueOnce(ok(summary({ actual_off: null, actual_on: null })))
      .mockResolvedValueOnce(
        ok({
          fixes: [
            { name: 'HEL', latitude: 60.3, longitude: 24.9 },
            { name: 'PIRAS', latitude: 57.2, longitude: 14 },
            { name: 'LHR', latitude: 51.5, longitude: -0.4 },
          ],
        }),
      );
    let body = await (await GET(request(QUERY))).json();
    expect(upstream.mock.calls[1][0]).toContain('/flights/FIN1331-1/route');
    expect(body.path).toMatchObject({ kind: 'planned', complete: false });

    upstream.mockReset();
    upstream
      .mockResolvedValueOnce(ok(summary({ actual_off: null, actual_on: null })))
      // Outside US navaid coverage: fixes without coordinates.
      .mockResolvedValueOnce(ok({ fixes: [{ name: 'HEL' }, { name: 'ABCDE', type: 'UNKNOWN' }, { name: 'LHR' }] }));
    body = await (await GET(request(QUERY))).json();
    expect(body).toEqual({ path: null, reason: 'no_data' });
  });

  it('answers no_data when none of the provider\'s legs is this journey', async () => {
    upstream.mockResolvedValueOnce(
      ok(summary({ origin: { code_iata: 'LHR' }, destination: { code_iata: 'HEL' } })),
    );
    const body = await (await GET(request(QUERY))).json();
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ path: null, reason: 'no_data' });
  });

  it('treats the provider\'s 400/404 as "nothing there", and a 5xx as an outage', async () => {
    upstream.mockResolvedValueOnce({ ok: false, status: 400 } as Response);
    expect(await (await GET(request(QUERY))).json()).toEqual({ path: null, reason: 'no_data' });

    upstream.mockReset();
    upstream.mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    expect((await GET(request(QUERY))).status).toBe(502);
  });

  it('will not spend on flights beyond the live horizon unless history is enabled', async () => {
    const old = 'flight=AY1331&date=2026-03-02&from=HEL&to=LHR&departure=2026-03-02T08:00:00Z';
    let body = await (await GET(request(old))).json();
    expect(upstream).not.toHaveBeenCalled();
    expect(body).toEqual({ path: null, reason: 'beyond_horizon' });

    process.env.FLIGHTAWARE_HISTORY = '1';
    upstream.mockResolvedValueOnce(ok(summary({ scheduled_out: '2026-03-02T08:00:00Z' }))).mockResolvedValueOnce(ok({ positions }));
    body = await (await GET(request(old))).json();
    expect(upstream.mock.calls[0][0]).toContain('/history/flights/AY1331?ident_type=designator&start=2026-03-01&end=2026-03-03');
    expect(upstream.mock.calls[1][0]).toContain('/history/flights/FIN1331-1/track');
    expect(body.path.kind).toBe('track');
  });

  it('does not ask about a flight the provider cannot see yet', async () => {
    const far = 'flight=AY1331&date=2026-09-25&from=HEL&to=LHR&departure=2026-09-25T08:00:00Z';
    const body = await (await GET(request(far))).json();
    expect(upstream).not.toHaveBeenCalled();
    expect(body).toEqual({ path: null, reason: 'not_yet' });
  });

  it('rejects missing or malformed parameters', async () => {
    expect((await GET(request('flight=AY1331'))).status).toBe(400);
    expect((await GET(request('flight=AY1331&date=14-09-2026&from=HEL&to=LHR&departure=2026-09-14T08:00:00Z'))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('answers not_configured, never an error, without a key in production', async () => {
    delete process.env.FLIGHTAWARE_API_KEY;
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const response = await GET(request(QUERY));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ path: null, reason: 'not_configured' });
    } finally {
      process.env.NODE_ENV = env;
    }
  });

  it('serves a deterministic mock without a key outside production', async () => {
    delete process.env.FLIGHTAWARE_API_KEY;
    const body = await (await GET(request('flight=AY1331&date=2026-09-14&from=HEL&to=FRA&departure=2026-09-14T08:00:00Z'))).json();
    expect(upstream).not.toHaveBeenCalled();
    expect(body.path).toMatchObject({ kind: 'track', complete: true });
    expect(body.path.points.length).toBeGreaterThan(10);
  });
});
