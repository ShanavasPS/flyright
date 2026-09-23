import type { JourneyRow } from './journeys';
import { EMPTY_FACTS, EMPTY_TRAVEL_DAY, type FlightFacts } from './travel-day';
import { splitClock, tripCard, type TripCardInput } from './trip-card';

function row(overrides: Partial<JourneyRow> = {}): JourneyRow {
  return {
    id: 'AY1337-2026-09-19',
    userId: null,
    mode: 'flight',
    carrier: 'Finnair',
    carrierCountry: 'FI',
    number: 'AY1337',
    fromCode: 'HEL',
    fromCountry: 'FI',
    toCode: 'LHR',
    toCountry: 'GB',
    distanceKm: 1840,
    // 16:00 in Helsinki, 17:05 in London.
    scheduledDeparture: '2026-09-19T13:00:00Z',
    scheduledArrival: '2026-09-19T16:05:00Z',
    ticketedDeparture: null,
    ticketedArrival: null,
    ticketPriceAmount: null,
    ticketPriceCurrency: null,
    notes: null,
    notesUpdatedAt: null,
    rating: null,
    bookingReference: 'FRX7YQ',
    seat: '14A',
    passCode: null,
    passFormat: null,
    passCapturedAt: null,
    ticketCode: null,
    ticketFormat: null,
    ticketCapturedAt: null,
    aircraftModel: null,
    aircraftReg: null,
    terminal: null,
    checkInDesk: null,
    gate: null,
    boardingTime: null,
    baggageBelt: null,
    actualDeparture: null,
    actualArrival: null,
    factsByUser: null,
    hiddenFromCircle: false,
    privateTrip: false,
    source: 'lookup',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    deletedAt: null,
    syncedAt: null,
    ...overrides,
  };
}

const posted: FlightFacts = {
  ...EMPTY_FACTS,
  terminal: '2',
  checkInDesk: 'Area 200',
  gate: '53',
  boardingTime: '2026-09-19T12:30:00Z',
};

function card(input: Partial<TripCardInput> & { at: string }) {
  return tripCard({
    row: row(),
    facts: EMPTY_FACTS,
    state: EMPTY_TRAVEL_DAY,
    phase: 'live',
    statusKnown: true,
    now: new Date(input.at),
    ...input,
  });
}

const values = (model: ReturnType<typeof tripCard>) =>
  model.sections.map((s) => s.cells.map((c) => c.value ?? `(${c.placeholder ?? 'add'})`));

describe('tripCard', () => {
  it('after Pro expires, preserves saved details without a live status or countdown', () => {
    const model = card({ at: '2026-09-19T14:00:00Z', facts: posted, monitoring: false });
    expect(model.status.text).toBe('Saved flight');
    expect(model.clock).toMatchObject({ kind: 'static', label: 'Scheduled departure' });
    expect(model.progress).toBeNull();
    expect(model.sections[0].cells.map(c => c.value)).toEqual(['2', 'Area 200', '53', expect.stringMatching(/15:30|3:30/)]);
    expect(model.sections[1].cells.map(c => c.value)).toEqual(['14A', 'FRX7YQ']);
    expect(model.footnote).toBe('Saved details. Live updates are off.');
  });

  it('days ahead: the countdown, the ticket, and when the rest will come', () => {
    const model = card({ at: '2026-09-16T09:00:00Z', phase: 'before' });
    expect(model.status).toEqual({ text: 'Scheduled', tone: 'neutral' });
    expect(model.clock).toMatchObject({ kind: 'countdown', label: 'Departs in' });
    expect(values(model)).toEqual([
      ['(On the day)', '(On the day)', '(On the day)', '(On the day)'],
      ['14A', 'FRX7YQ'],
      ['(After landing)'],
    ]);
  });

  it('keeps historical arrival and delay records available on Free', () => {
    const model = card({ at: '2026-09-25T09:00:00Z', phase: 'ended', monitoring: false,
      facts: { ...posted, actualArrival: '2026-09-19T17:08:00Z' } });
    expect(model.status.text).toBe('Landed 1h 3m late');
    expect(model.clock).toMatchObject({ kind: 'static', label: 'Flew on' });
    expect(model.footnote).toBeNull();
  });

  it('at the airport: everything posted, in the same places', () => {
    const model = card({ at: '2026-09-19T12:00:00Z', facts: posted });
    expect(model.status.text).toBe('On time');
    expect(model.sections[0].title).toBe('From Helsinki · HEL');
    expect(model.sections[2].title).toBe('Into London · LHR');
    expect(model.sections[0].cells.map((c) => c.value)).toEqual(['2', 'Area 200', '53', expect.stringMatching(/15:30|3:30/)]);
    expect(model.sections[2].cells[0]).toMatchObject({ value: null, placeholder: 'After landing', wide: true });
  });

  it('delayed: the status says so and the countdown turns', () => {
    const model = card({ at: '2026-09-19T12:00:00Z', facts: { ...posted, delayMinutes: 46 } });
    expect(model.status).toEqual({ text: 'Delayed 46 min', tone: 'late' });
    expect(model.clock).toMatchObject({ tone: 'late' });
  });

  it('a schedule change reads as how much it moved', () => {
    const model = card({ at: '2026-09-19T11:00:00Z', row: row({ ticketedDeparture: '2026-09-19T12:14:00Z' }) });
    expect(model.status).toEqual({ text: '46 min later', tone: 'late' });
  });

  it('boarding open: the boarding word and a boarding clock', () => {
    const model = card({ at: '2026-09-19T12:40:00Z', facts: posted });
    expect(model.status).toEqual({ text: 'Boarding', tone: 'boarding' });
    expect(model.clock).toMatchObject({ tone: 'boarding' });
  });

  it('in the air: the landing countdown and how far along', () => {
    const model = card({
      at: '2026-09-19T14:00:00Z',
      facts: posted,
      state: { stage: 'departed', stamps: { departed: '2026-09-19T13:00:00Z' } },
    });
    expect(model.status.text).toBe('In the air');
    expect(model.clock).toMatchObject({ kind: 'countdown', label: 'Lands in' });
    expect(model.progress?.caption).toMatch(/ of 1,840 km$/);
    // Past the departure, a missing departure fact was never recorded.
    expect(card({ at: '2026-09-19T14:00:00Z', state: { stage: 'departed', stamps: {} } }).sections[0].cells[0].placeholder).toBe(
      'Not recorded',
    );
  });

  it('landed: the landing time and the belt', () => {
    const model = card({
      at: '2026-09-19T16:20:00Z',
      facts: { ...posted, actualArrival: '2026-09-19T16:08:00Z', baggageBelt: '7' },
      state: { stage: 'landed', stamps: { landed: '2026-09-19T16:08:00Z' } },
    });
    expect(model.status).toEqual({ text: 'Landed', tone: 'good' });
    expect(model.clock).toMatchObject({ kind: 'static', label: 'Landed at' });
    expect(model.sections[2].cells[0].value).toBe('Belt 7');
  });

  it('trip over: the record, with how late it landed', () => {
    const model = card({
      at: '2026-09-25T09:00:00Z',
      phase: 'ended',
      facts: { ...posted, actualDeparture: '2026-09-19T13:03:00Z', actualArrival: '2026-09-19T17:08:00Z', baggageBelt: '7' },
    });
    expect(model.status).toEqual({ text: 'Landed 1h 3m late', tone: 'late' });
    expect(model.clock).toMatchObject({ kind: 'static', label: 'Flew on', unit: '2026' });
    expect(model.line).toMatch(/^Took off .+ · landed .+$/);
    expect(model.sections).toHaveLength(3);
  });

  it('trip over with nothing recorded: the ticket alone', () => {
    const model = card({ at: '2026-09-25T09:00:00Z', phase: 'ended' });
    expect(model.status).toEqual({ text: 'Flown', tone: 'neutral' });
    expect(model.sections.map((s) => s.title)).toEqual(['Your ticket']);
  });

  it('a trip without live updates offers every box to fill in', () => {
    const model = card({ at: '2026-09-19T10:00:00Z', row: row({ source: 'manual' }), statusKnown: false });
    expect(model.status.text).toBe('From your ticket');
    expect(values(model)).toEqual([['(add)', '(add)', '(add)', '(add)'], ['14A', 'FRX7YQ'], ['(add)']]);
    expect(model.footnote).toMatch(/Tap a box/);
  });

  it('marks what the traveller typed, until the airport posts it', () => {
    const typed = row({ gate: '53', factsByUser: '["gate"]' });
    const model = card({ at: '2026-09-19T12:00:00Z', row: typed, facts: { ...EMPTY_FACTS, gate: '53', terminal: '2' } });
    const gate = model.sections[0].cells.find((c) => c.field === 'gate');
    expect(gate).toMatchObject({ value: '53', byUser: true });
    expect(model.footnote).toMatch(/airport's wins/);
  });

  it('an empty ticket offers to be filled in', () => {
    const model = card({ at: '2026-09-19T12:00:00Z', row: row({ seat: null, bookingReference: null }) });
    expect(model.sections[1].cells.map((c) => c.placeholder)).toEqual([null, null]);
  });
});

describe('splitClock', () => {
  it('separates a 12-hour marker and leaves a 24-hour clock whole', () => {
    expect(splitClock('5:08 PM')).toEqual(['5:08', 'PM']);
    expect(splitClock('5:08 PM')).toEqual(['5:08', 'PM']);
    expect(splitClock('17:08')).toEqual(['17:08', null]);
  });
});

describe('tripCard — a late departure the airport has not reported', () => {
  // QR516-style: 16:40 scheduled, estimate unchanged, still at the gate at 16:55.
  const fresh = { ...EMPTY_FACTS, estimatedDeparture: '2026-09-19T13:00:00Z', observedAt: '2026-09-19T13:10:00Z' };

  it('holds the flight at the gate while a recent check says it has not left', () => {
    const model = card({ at: '2026-09-19T13:15:00Z', facts: fresh });
    expect(model.status).toEqual({ text: 'Not yet departed', tone: 'late' });
    expect(model.clock).toMatchObject({ kind: 'static', label: 'Due to leave at' });
    expect(model.progress).toBeNull();
  });

  it('goes by the timetable once the last check is stale, or for a trip with no feed', () => {
    const stale = card({ at: '2026-09-19T13:45:00Z', facts: fresh });
    expect(stale.clock).toMatchObject({ kind: 'countdown', label: 'Lands in' });
    const manual = card({ at: '2026-09-19T13:15:00Z', facts: fresh, row: row({ source: 'manual' }) });
    expect(manual.clock).toMatchObject({ kind: 'countdown', label: 'Lands in' });
  });

  it('flies as soon as the take-off is reported', () => {
    const model = card({ at: '2026-09-19T13:31:00Z', facts: { ...fresh, actualDeparture: '2026-09-19T13:26:00Z', observedAt: '2026-09-19T13:30:00Z' } });
    expect(model.status.text).toBe('In the air');
  });
});
