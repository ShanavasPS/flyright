import type { FlightStatus, InboundLeg } from './flight-lookup';
import { inboundNewsworthy, inboundOutlook } from './inbound';

function inbound(partial: Partial<InboundLeg>): InboundLeg {
  return {
    flight: 'AY1330',
    from: { code: 'ARN' },
    status: 'EnRoute',
    landed: false,
    scheduledArrival: '2026-08-10T06:50:00Z',
    estimatedArrival: null,
    actualArrival: null,
    ...partial,
  };
}

// Scheduled turnaround is 70 min (06:50 arrival → 08:00 departure), so with
// the 35-min minimum turnaround there are 35 min of slack to absorb lateness.
function status(partial: Partial<FlightStatus>): FlightStatus {
  return {
    flight: 'AY1331',
    date: '2026-08-10',
    status: 'scheduled',
    delayMinutes: null,
    distanceKm: 1834,
    carrier: { name: 'Finnair', iata: 'AY' },
    carrierCountry: 'FI',
    from: { code: 'HEL', country: 'FI' },
    to: { code: 'LHR', country: 'GB' },
    scheduledDeparture: '2026-08-10T08:00:00Z',
    scheduledArrival: '2026-08-10T10:35:00Z',
    inbound: inbound({}),
    ...partial,
  };
}

describe('inboundOutlook', () => {
  it('reports a happy path with zero predicted delay', () => {
    const outlook = inboundOutlook(status({}))!;
    expect(outlook.lateMinutes).toBe(0);
    expect(outlook.predictedDepartureDelayMinutes).toBe(0);
    expect(outlook.severity).toBe('none');
  });

  it('lets schedule slack absorb a modest inbound delay', () => {
    // 30 late lands 07:20; +35 turnaround = ready 07:55, before 08:00.
    const outlook = inboundOutlook(
      status({ inbound: inbound({ estimatedArrival: '2026-08-10T07:20:00Z' }) }),
    )!;
    expect(outlook.lateMinutes).toBe(30);
    expect(outlook.predictedDepartureDelayMinutes).toBe(0);
    expect(outlook.severity).toBe('none');
  });

  it('predicts the knock-on once lateness exceeds the slack', () => {
    // 75 late lands 08:05; +35 = ready 08:40 → 40 min slip.
    const outlook = inboundOutlook(
      status({ inbound: inbound({ estimatedArrival: '2026-08-10T08:05:00Z' }) }),
    )!;
    expect(outlook.lateMinutes).toBe(75);
    expect(outlook.predictedDepartureDelayMinutes).toBe(40);
    expect(outlook.severity).toBe('likely');
  });

  it('trusts an actual arrival over the estimate once landed', () => {
    const outlook = inboundOutlook(
      status({
        inbound: inbound({
          landed: true,
          estimatedArrival: '2026-08-10T08:05:00Z',
          actualArrival: '2026-08-10T07:00:00Z',
        }),
      }),
    )!;
    expect(outlook.landed).toBe(true);
    expect(outlook.lateMinutes).toBe(10);
    expect(outlook.predictedDepartureDelayMinutes).toBe(0);
  });

  it('respects a tighter-than-minimum scheduled turnaround', () => {
    // Airline planned 25 min (07:35 → 08:00); inbound 20 late → ready 08:20.
    const outlook = inboundOutlook(
      status({
        inbound: inbound({
          scheduledArrival: '2026-08-10T07:35:00Z',
          estimatedArrival: '2026-08-10T07:55:00Z',
        }),
      }),
    )!;
    expect(outlook.predictedDepartureDelayMinutes).toBe(20);
    expect(outlook.severity).toBe('watch');
  });

  it('is null without inbound data or after departure', () => {
    expect(inboundOutlook(status({ inbound: null }))).toBeNull();
    expect(inboundOutlook(status({ inbound: undefined }))).toBeNull();
    expect(inboundOutlook(status({ actualDeparture: '2026-08-10T08:02:00Z' }))).toBeNull();
  });

  it('is null when the rotation data is nonsensical', () => {
    // Inbound scheduled to land after our departure — wrong leg, say nothing.
    expect(
      inboundOutlook(status({ inbound: inbound({ scheduledArrival: '2026-08-10T09:00:00Z' }) })),
    ).toBeNull();
  });
});

describe('inboundNewsworthy', () => {
  const late = () =>
    inboundOutlook(
      status({ inbound: inbound({ estimatedArrival: '2026-08-10T08:05:00Z' }) }),
    )!;

  it('pushes when the board still says on time', () => {
    expect(inboundNewsworthy(late())).toBe(true);
  });

  it('stays quiet once the airline has announced as much', () => {
    const outlook = inboundOutlook(
      status({
        estimatedDeparture: '2026-08-10T08:35:00Z',
        inbound: inbound({ estimatedArrival: '2026-08-10T08:05:00Z' }),
      }),
    )!;
    // Predicted 40 vs announced 35 — only 5 min of news.
    expect(inboundNewsworthy(outlook)).toBe(false);
  });

  it('stays quiet below the likely threshold', () => {
    expect(inboundNewsworthy(inboundOutlook(status({}))!)).toBe(false);
  });
});
