import { lookupFlightPath, pathWorthAsking } from '@/services/flight-path';

jest.mock('@/services/flight-lookup', () => ({
  lookupHeaders: async () => ({ 'X-FlyRight-Guest': '1' }),
}));

const NOW = Date.parse('2026-09-15T12:00:00Z');

describe('pathWorthAsking', () => {
  it('asks inside two days of departure and for anything already flown', () => {
    expect(pathWorthAsking('2026-09-16T20:00:00Z', NOW)).toBe(true);
    expect(pathWorthAsking('2026-09-01T08:00:00Z', NOW)).toBe(true);
    expect(pathWorthAsking('2026-09-20T08:00:00Z', NOW)).toBe(false);
    expect(pathWorthAsking('garbage', NOW)).toBe(false);
  });
});

describe('lookupFlightPath', () => {
  it('sends the journey and the caller identity to the route', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ path: null, reason: 'no_data' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await lookupFlightPath({
      number: 'AY1331',
      date: '2026-09-14',
      fromCode: 'HEL',
      toCode: 'LHR',
      scheduledDeparture: '2026-09-14T08:00:00Z',
      scheduledArrival: '2026-09-14T10:35:00Z',
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/flight-path?flight=AY1331&date=2026-09-14&from=HEL&to=LHR&departure=2026-09-14T08%3A00%3A00Z',
    );
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { 'X-FlyRight-Guest': '1' } });
    expect(result).toEqual({ path: null, reason: 'no_data' });
  });

  it('throws on a failed response so the caller keeps its great circle', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502 }) as unknown as typeof fetch;
    await expect(
      lookupFlightPath({
        number: 'AY1331',
        date: '2026-09-14',
        fromCode: 'HEL',
        toCode: 'LHR',
        scheduledDeparture: '2026-09-14T08:00:00Z',
        scheduledArrival: '2026-09-14T10:35:00Z',
      }),
    ).rejects.toThrow('flight-path 502');
  });
});
