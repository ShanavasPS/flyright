import { EMPTY_FACTS } from './travel-day';
import {
  airportPatch,
  boardingInstant,
  parseClock,
  typedFields,
  typedPatch,
  withRecord,
  type RecordRow,
} from './trip-record';

const blank: RecordRow = {
  terminal: null,
  checkInDesk: null,
  gate: null,
  boardingTime: null,
  baggageBelt: null,
  actualDeparture: null,
  actualArrival: null,
  factsByUser: null,
};

describe('airportPatch', () => {
  it('records what the airport posts, and nothing when it has changed nothing', () => {
    const patch = airportPatch(blank, { ...EMPTY_FACTS, gate: '53', terminal: '2' });
    expect(patch).toEqual({ gate: '53', terminal: '2' });
    expect(airportPatch({ ...blank, gate: '53', terminal: '2' }, { ...EMPTY_FACTS, gate: '53', terminal: '2' })).toBeNull();
  });

  it('keeps a recorded value the feed has since dropped', () => {
    expect(airportPatch({ ...blank, gate: '53' }, EMPTY_FACTS)).toBeNull();
  });

  it("lets the airport win over what the traveller typed, which stops being theirs", () => {
    const row = { ...blank, gate: '12', factsByUser: '["gate","baggageBelt"]' };
    expect(airportPatch(row, { ...EMPTY_FACTS, gate: '53' })).toEqual({ gate: '53', factsByUser: '["baggageBelt"]' });
    // Posting the same value confirms it: no longer "Added by you".
    expect(airportPatch({ ...row, gate: '53' }, { ...EMPTY_FACTS, gate: '53' })).toEqual({
      gate: '53',
      factsByUser: '["baggageBelt"]',
    });
  });

  it('keeps a typed value the airport has not posted', () => {
    const row = { ...blank, baggageBelt: '7', factsByUser: '["baggageBelt"]' };
    expect(airportPatch(row, { ...EMPTY_FACTS, gate: '53' })).toEqual({ gate: '53' });
  });
});

describe('typedPatch', () => {
  it('marks a typed field and unmarks a cleared one', () => {
    expect(typedPatch(blank, 'gate', '53')).toEqual({ gate: '53', factsByUser: '["gate"]' });
    expect(typedPatch({ ...blank, gate: '53', factsByUser: '["gate"]' }, 'gate', null)).toEqual({
      gate: null,
      factsByUser: null,
    });
  });

  it('survives a garbled list', () => {
    expect([...typedFields({ factsByUser: 'not json' })]).toEqual([]);
    expect([...typedFields({ factsByUser: '["gate","nonsense"]' })]).toEqual(['gate']);
  });
});

describe('withRecord', () => {
  it('fills what the live facts lack, and never overrides them', () => {
    const merged = withRecord({ ...EMPTY_FACTS, gate: '53' }, { ...blank, gate: '12', baggageBelt: '7' });
    expect(merged.gate).toBe('53');
    expect(merged.baggageBelt).toBe('7');
  });
});

describe('parseClock', () => {
  it('reads the ways people type a time', () => {
    expect(parseClock('15:30')).toBe(930);
    expect(parseClock('9.05')).toBe(545);
    expect(parseClock('1530')).toBe(930);
    expect(parseClock('3:30 pm')).toBe(930);
    expect(parseClock('12:10 AM')).toBe(10);
    expect(parseClock('12:10pm')).toBe(730);
  });

  it('rejects what is not a time', () => {
    expect(parseClock('25:00')).toBeNull();
    expect(parseClock('10:75')).toBeNull();
    expect(parseClock('13:00 pm')).toBeNull();
    expect(parseClock('gate 5')).toBeNull();
  });
});

describe('boardingInstant', () => {
  it("reads the clock at the departure airport on the departure's day", () => {
    // HEL is UTC+3 in September.
    const row = { fromCode: 'HEL', scheduledDeparture: '2026-09-19T13:00:00Z' };
    expect(boardingInstant(row, 15 * 60 + 30)).toBe('2026-09-19T12:30:00.000Z');
  });

  it('puts a boarding after the departure clock on the day before', () => {
    // 00:20 local departure; boarding typed as 23:50.
    const row = { fromCode: 'HEL', scheduledDeparture: '2026-09-19T21:20:00Z' };
    expect(boardingInstant(row, 23 * 60 + 50)).toBe('2026-09-19T20:50:00.000Z');
  });
});
