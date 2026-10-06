import { widgetPropsAt, widgetTimeline, type WidgetInput } from '@/services/home-widget-content';
import {
  DEFAULT_PLAN,
  EMPTY_FACTS,
  EMPTY_TRAVEL_DAY,
  advance,
  type TravelDayState,
  type TravelJourney,
} from '@/services/travel-day';

const NOW = new Date('2026-08-22T12:00:00Z');

function journey(overrides: Partial<TravelJourney> = {}): TravelJourney {
  return {
    id: 'AY123-2026-08-25',
    mode: 'flight',
    source: 'lookup',
    number: 'AY123',
    carrier: 'Finnair',
    fromCode: 'HEL',
    toCode: 'LHR',
    scheduledDeparture: '2026-08-25T08:00Z',
    scheduledArrival: '2026-08-25T10:35Z',
    ...overrides,
  };
}

function input(rows: TravelJourney[], overrides: Partial<WidgetInput> = {}): WidgetInput {
  return {
    rows,
    stateOf: () => EMPTY_TRAVEL_DAY,
    planOf: () => DEFAULT_PLAN,
    factsOf: () => EMPTY_FACTS,
    live: true,
    now: NOW,
    ...overrides,
  };
}

describe('widgetPropsAt', () => {
  it('asks for a trip when nothing is ahead', () => {
    const props = widgetPropsAt(input([journey({ scheduledDeparture: '2026-08-01T08:00Z', scheduledArrival: '2026-08-01T10:35Z' })]), NOW);
    expect(props.kind).toBe('none');
    expect(props.url).toBe('flyright://add');
  });

  it('shows the soonest flight ahead, with the rest counted', () => {
    const later = journey({ id: 'later', number: 'AY5', scheduledDeparture: '2026-09-02T08:00Z', scheduledArrival: '2026-09-02T10:00Z' });
    const props = widgetPropsAt(input([later, journey()]), NOW);
    expect(props).toMatchObject({
      kind: 'upcoming',
      url: 'flyright://journey/AY123-2026-08-25',
      fromCode: 'HEL',
      toCode: 'LHR',
      fromCity: 'Helsinki',
      toCity: 'London',
      flightLabel: 'AY123',
      whenLabel: 'In 3 days',
      laterCount: 1,
    });
    expect(props.depTime).toMatch(/^11:00/);
    expect(props.departsAt).toBe(Date.parse('2026-08-25T08:00Z'));
  });

  it('words the wait as the My travels header does', () => {
    const later = journey({ scheduledDeparture: '2026-09-02T08:00Z', scheduledArrival: '2026-09-02T10:00Z' });
    expect(widgetPropsAt(input([later]), NOW).whenLabel).toBe('In 2 weeks');
    expect(widgetPropsAt(input([journey()]), new Date('2026-08-24T02:00Z')).whenLabel).toBe('In 30 hours');
  });

  it('marks a next-day landing on the arrival clock', () => {
    const overnight = journey({ fromCode: 'DFW', scheduledDeparture: '2026-08-25T02:35Z', scheduledArrival: '2026-08-25T11:50Z' });
    expect(widgetPropsAt(input([overnight]), NOW).arrTime).toMatch(/⁺¹$/);
    expect(widgetPropsAt(input([journey()]), NOW).arrTime).not.toMatch(/⁺/);
  });

  it('never prints a fabricated noon for a trip saved without times', () => {
    const manual = journey({ source: 'manual', scheduledDeparture: '2026-08-25T12:00:00', scheduledArrival: '2026-08-25T12:00:00' });
    const props = widgetPropsAt(input([manual]), NOW);
    expect(props.kind).toBe('upcoming');
    expect(props.depTime).toBe('');
    expect(props.departsAt).toBe(0);
  });

  it('skips trips that are not flights', () => {
    expect(widgetPropsAt(input([journey({ mode: 'train' as TravelJourney['mode'] })]), NOW).kind).toBe('none');
  });

  it('turns live four hours before departure, with the countdown to take-off', () => {
    const t = new Date('2026-08-25T05:00Z');
    const props = widgetPropsAt(input([journey()]), t);
    expect(props.kind).toBe('live');
    expect(props.clockLabel).toBe('DEPARTS IN');
    expect(props.countdownEnd).toBe(Date.parse('2026-08-25T08:00Z'));
  });

  it('stays the plain card through the travel day without Pro', () => {
    const t = new Date('2026-08-25T05:00Z');
    expect(widgetPropsAt(input([journey()], { live: false }), t).kind).toBe('upcoming');
    // …and moves on once the flight has left.
    expect(widgetPropsAt(input([journey()], { live: false }), new Date('2026-08-25T09:00Z')).kind).toBe('none');
  });

  it('counts to the landing in the air', () => {
    const t = new Date('2026-08-25T09:00Z');
    const props = widgetPropsAt(input([journey()]), t);
    expect(props.kind).toBe('live');
    expect(props.clockLabel).toBe('LANDS IN');
    expect(props.countdownEnd).toBe(Date.parse('2026-08-25T10:35Z'));
  });

  it('follows the traveller’s own steps', () => {
    const t = new Date('2026-08-25T06:00Z');
    const state: TravelDayState = advance(EMPTY_TRAVEL_DAY, 'at_airport', t);
    const props = widgetPropsAt(input([journey()], { stateOf: () => state }), t);
    expect(props.kind).toBe('live');
    expect(props.subtitle).not.toBe('');
  });
});

describe('widgetTimeline', () => {
  it('starts now and changes on its own at each turning point', () => {
    const entries = widgetTimeline(input([journey()]));
    expect(entries[0].date).toEqual(NOW);
    const at = (iso: string) => entries.find((e) => e.date.getTime() === Date.parse(iso));
    // The day words turn over at midnight…
    expect(at('2026-08-23T00:00Z')?.props.whenLabel).toBe('In 2 days');
    // …the card goes live at T−4h, flips to the landing clock after take-off…
    expect(at('2026-08-25T04:00Z')?.props.kind).toBe('live');
    expect(entries.find((e) => e.props.clockLabel === 'LANDS IN')).toBeTruthy();
    // …and ends on the empty card once the window has closed.
    expect(entries[entries.length - 1].props.kind).toBe('none');
  });

  it('drops moments that would not change the card', () => {
    const entries = widgetTimeline(input([journey()]));
    for (let i = 1; i < entries.length; i++) {
      expect(JSON.stringify(entries[i].props)).not.toBe(JSON.stringify(entries[i - 1].props));
      expect(entries[i].date.getTime()).toBeGreaterThan(entries[i - 1].date.getTime());
    }
  });

  it('reads nothing but the empty card with no trips', () => {
    const entries = widgetTimeline(input([]));
    expect(entries).toHaveLength(1);
    expect(entries[0].props.kind).toBe('none');
  });
});
