import type { JourneyRow } from './journeys';
import { ALL_TIME } from './world-period';
import { shareCopy } from './world-share';

const NOW = new Date('2026-09-07T12:00:00Z');

function row(over: Partial<JourneyRow>): JourneyRow {
  return {
    id: over.id ?? `${over.fromCode}-${over.toCode}-${over.scheduledDeparture}`,
    mode: 'flight',
    source: 'manual',
    carrier: 'Finnair',
    carrierCountry: 'FI',
    number: 'AY1331',
    fromCode: 'HEL',
    fromCountry: 'FI',
    toCode: 'LHR',
    toCountry: 'GB',
    distanceKm: 1830,
    scheduledDeparture: '2026-09-04T13:35:00Z',
    scheduledArrival: '2026-09-04T16:40:00Z',
    ...over,
  } as JourneyRow;
}

const rows = [
  row({ scheduledDeparture: '2025-11-02T08:45Z', scheduledArrival: '2025-11-02T13:30Z', fromCode: 'DXB', fromCountry: 'AE', toCode: 'LAX', toCountry: 'US', carrier: 'Emirates', number: 'EK215', distanceKm: 13400 }),
  row({ scheduledDeparture: '2025-03-14T06:00Z', scheduledArrival: '2025-03-14T09:00Z' }),
  row({ scheduledDeparture: '2025-06-01T06:00Z', scheduledArrival: '2025-06-01T09:00Z' }),
];

describe('shareCopy', () => {
  it('names the traveller and the year', () => {
    const copy = shareCopy({ rows, period: { kind: 'year', year: 2025 }, kind: 'period' }, 'Sam', NOW);
    expect(copy.eyebrow).toBe('WHERE SAM FLEW');
    expect(copy.title).toBe('2025');
    expect(copy.single).toBe(false);
    expect(copy.stats.map((s) => s.label)).toEqual(['flights', 'airports', 'countries', 'km']);
    expect(copy.stats[3].value).toBe('17.1k');
    expect(copy.details.map((d) => d.label)).toEqual(['Most visited', 'Longest flight', 'Most flown']);
    expect(copy.details[1].value).toBe('DXB → LAX · 13,400 km');
    expect(copy.details[2].value).toBe('Finnair');
  });

  it('speaks in the first person without a name', () => {
    const copy = shareCopy({ rows, period: { kind: 'month', year: 2025, month: 3 }, kind: 'period' }, null, NOW);
    expect(copy.eyebrow).toBe('WHERE I FLEW');
    expect(copy.title).toBe('March 2025');
  });

  it('spans the years for all time', () => {
    const copy = shareCopy({ rows: [...rows, row({ scheduledDeparture: '2019-01-01T06:00Z' })], period: ALL_TIME, kind: 'period' }, 'Sam', NOW);
    expect(copy.eyebrow).toBe('EVERYWHERE SAM HAS FLOWN');
    expect(copy.title).toBe('2019 – 2025');
  });

  it('switches to the future tense when every flight is ahead', () => {
    const copy = shareCopy(
      { rows: [row({ scheduledDeparture: '2026-10-04T15:00Z' })], period: { kind: 'year', year: 2026 }, kind: 'period' },
      'Sam',
      NOW,
    );
    expect(copy.eyebrow).toBe('WHERE SAM IS FLYING');
  });

  it('makes a single flight its own card', () => {
    const copy = shareCopy({ rows: [rows[0]], period: ALL_TIME, kind: 'route' }, null, NOW);
    expect(copy.single).toBe(true);
    expect(copy.eyebrow).toBe('I FLEW');
    expect(copy.title).toBe('DXB → LAX');
    expect(copy.subtitle).toBe('Dubai to Los Angeles · Emirates EK215 · 2 Nov 2025');
    expect(copy.stats[0]).toEqual({ value: '13,400', label: 'km' });
    expect(copy.details).toEqual([]);
  });

  it('describes a route flown more than once', () => {
    const copy = shareCopy({ rows: [rows[1], rows[2]], period: ALL_TIME, kind: 'route' }, 'Sam', NOW);
    expect(copy.title).toBe('HEL → LHR');
    expect(copy.subtitle).toBe('Helsinki and London · 2 flights · Finnair');
  });
});
