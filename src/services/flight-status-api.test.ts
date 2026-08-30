/** Tests the API route's upstream normalization — most importantly the
 * inbound-rotation leg picking, which has no other coverage. Lives outside
 * src/app so expo-router never sees a non-route file in the routes dir. */

import { GET } from '../app/api/flight-status+api';

const numberLeg = {
  number: 'AY 1331',
  status: 'CheckIn',
  greatCircleDistance: { km: 1834 },
  airline: { name: 'Finnair', iata: 'AY' },
  aircraft: { reg: 'OH-LKO', model: 'Airbus A321' },
  departure: {
    airport: { iata: 'HEL', countryCode: 'FI' },
    scheduledTime: { utc: '2026-08-30 08:00Z' },
  },
  arrival: {
    airport: { iata: 'LHR', countryCode: 'GB' },
    scheduledTime: { utc: '2026-08-30 10:35Z' },
  },
};

const rotationLegs = [
  {
    // Wrong airport — the aircraft's later leg out of LHR.
    number: 'AY 1332',
    status: 'Expected',
    departure: { airport: { iata: 'LHR' } },
    arrival: { airport: { iata: 'HEL' }, scheduledTime: { utc: '2026-08-30 15:00Z' } },
  },
  {
    // Arrives at HEL but after our departure — the NEXT rotation, not ours.
    number: 'AY 962',
    status: 'Expected',
    departure: { airport: { iata: 'CPH' } },
    arrival: { airport: { iata: 'HEL' }, scheduledTime: { utc: '2026-08-30 12:00Z' } },
  },
  {
    // The true inbound: lands at HEL before our 08:00Z departure.
    number: 'AY 1330',
    status: 'EnRoute',
    departure: { airport: { iata: 'ARN' } },
    arrival: {
      airport: { iata: 'HEL' },
      scheduledTime: { utc: '2026-08-30 06:50Z' },
      predictedTime: { utc: '2026-08-30 07:35Z' },
    },
  },
];

const upstream = jest.fn();

beforeEach(() => {
  process.env.AERODATABOX_API_KEY = 'test-key';
  upstream.mockReset();
  global.fetch = upstream as unknown as typeof fetch;
});

const jsonResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

const request = (query: string) =>
  ({ url: `https://getflyright.com/api/flight-status?${query}` }) as Request;

describe('GET /api/flight-status', () => {
  it('resolves the inbound rotation leg when asked', async () => {
    upstream
      .mockResolvedValueOnce(jsonResponse([numberLeg]))
      .mockResolvedValueOnce(jsonResponse(rotationLegs));

    const body = await (await GET(request('flight=AY1331&date=2026-08-30&inbound=1'))).json();

    expect(upstream).toHaveBeenCalledTimes(2);
    expect(upstream.mock.calls[1][0]).toContain('/flights/reg/OH-LKO/2026-08-30');
    expect(body.aircraft).toEqual({ reg: 'OH-LKO', model: 'Airbus A321' });
    expect(body.inbound).toMatchObject({
      flight: 'AY1330',
      from: { code: 'ARN' },
      landed: false,
      scheduledArrival: '2026-08-30T06:50Z',
      estimatedArrival: '2026-08-30T07:35Z',
    });
  });

  it('skips the rotation lookup without the inbound flag', async () => {
    upstream.mockResolvedValueOnce(jsonResponse([numberLeg]));

    const body = await (await GET(request('flight=AY1331&date=2026-08-30'))).json();

    expect(upstream).toHaveBeenCalledTimes(1);
    expect(body.inbound).toBeNull();
  });

  it('skips the rotation lookup once the flight is operating', async () => {
    upstream.mockResolvedValueOnce(jsonResponse([{ ...numberLeg, status: 'EnRoute' }]));

    const body = await (await GET(request('flight=AY1331&date=2026-08-30&inbound=1'))).json();

    expect(upstream).toHaveBeenCalledTimes(1);
    expect(body.inbound).toBeNull();
  });

  it('serves inbound: null when the rotation lookup fails', async () => {
    upstream
      .mockResolvedValueOnce(jsonResponse([numberLeg]))
      .mockResolvedValueOnce({ ok: false, status: 429 } as Response);

    const body = await (await GET(request('flight=AY1331&date=2026-08-30&inbound=1'))).json();

    expect(body.inbound).toBeNull();
    // The status payload itself must be unharmed.
    expect(body.from.code).toBe('HEL');
  });

  it('serves inbound: null when no reg is published yet', async () => {
    upstream.mockResolvedValueOnce(jsonResponse([{ ...numberLeg, aircraft: undefined }]));

    const body = await (await GET(request('flight=AY1331&date=2026-08-30&inbound=1'))).json();

    expect(upstream).toHaveBeenCalledTimes(1);
    expect(body.aircraft).toBeNull();
    expect(body.inbound).toBeNull();
  });
});
