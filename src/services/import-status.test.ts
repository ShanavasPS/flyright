import { FlightLookupError, type FlightStatus } from '@/services/flight-lookup';
import { importStatus, type ImportStatusInput } from './import-status';

// flight-lookup imports @clerk/expo, whose native bundle opens a MessagePort
// at import time; unmocked, that handle keeps Jest (and release:preflight)
// from ever exiting. Same mock as flight-lookup.test.ts.
jest.mock('@clerk/expo', () => ({ getClerkInstance: jest.fn() }));

const flight = (over: Partial<FlightStatus> = {}): FlightStatus => ({
  flight: 'QR304', date: '2026-09-19', status: 'scheduled', landed: false, delayMinutes: null,
  distanceKm: 4397, carrier: { name: 'Qatar Airways', iata: 'QR' }, carrierCountry: 'QA',
  from: { code: 'HEL', country: 'FI' }, to: { code: 'DOH', country: 'QA' },
  scheduledDeparture: null, scheduledArrival: null, ...over,
});

const base: ImportStatusInput = {
  pass: false, ticket: false, attachable: false, already: false,
  plan: { kind: 'lookup', flight: flight() }, edited: false, lookupError: null,
};
const status = (over: Partial<ImportStatusInput>) => importStatus({ ...base, ...over });

/** Verbs that would make the line read as something the traveller must do. */
const IMPERATIVE_OPENERS = /(^|[·—]\s*)(update|save|add|sign in|scan|upload|open|enter|check|tap)\b/i;

const EVERY_SCENARIO: [string, Partial<ImportStatusInput>][] = [
  ['pass onto a saved trip', { attachable: true, already: true, pass: true }],
  ['ticket onto a saved trip', { attachable: true, already: true, ticket: true }],
  ['details onto a saved trip', { attachable: true, already: true }],
  ['saved trip, nothing new', { already: true }],
  ['lookup pending', { plan: { kind: 'pending' } }],
  ['scheduled', {}],
  ['arrived, delay unknown', { plan: { kind: 'lookup', flight: flight({ landed: true }) } }],
  ['arrived on time', { plan: { kind: 'lookup', flight: flight({ landed: true, delayMinutes: 0 }) } }],
  ['arrived late', { plan: { kind: 'lookup', flight: flight({ landed: true, delayMinutes: 95 }) } }],
  ['journal, year edited', { plan: { kind: 'journal' }, edited: true }],
  ['journal, sign-in required', { plan: { kind: 'journal' }, lookupError: new FlightLookupError('sign in', 401) }],
  ['journal, quota', { plan: { kind: 'journal' }, lookupError: new FlightLookupError('quota', 429) }],
  ['journal, 404', { plan: { kind: 'journal' }, lookupError: new FlightLookupError('missing', 404) }],
  ['journal, outage', { plan: { kind: 'journal' }, lookupError: new Error('offline') }],
  ['journal, outside lookup', { plan: { kind: 'journal' } }],
  ['route not recognised', { plan: { kind: 'incomplete' } }],
];

describe('importStatus', () => {
  it('says what saving does to a trip already in My travels, not what to do', () => {
    expect(status({ attachable: true, already: true, pass: true })).toEqual({
      text: 'Already in Flights · this boarding pass will be saved to it', tone: 'good',
    });
    expect(status({ attachable: true, already: true, ticket: true }).text)
      .toBe('Already in Flights · this ticket code will be saved to it');
    expect(status({ attachable: true, already: true }).text)
      .toBe('Already in Flights · its details will be updated');
    expect(status({ already: true })).toEqual({ text: 'Already in Flights · nothing new to save', tone: 'dim' });
  });

  it('prefers the boarding pass over a ticket code when a leg carries both', () => {
    expect(status({ attachable: true, already: true, pass: true, ticket: true }).text).toContain('boarding pass');
  });

  it('describes the incomplete leg as a state; the button carries the action', () => {
    expect(status({ plan: { kind: 'incomplete' } })).toEqual({
      text: 'Route not recognised · needs its airports before it can be saved', tone: 'warn',
    });
  });

  it('explains a journal entry by why the lookup did not run', () => {
    expect(status({ plan: { kind: 'journal' }, lookupError: new FlightLookupError('sign in', 401) }).text)
      .toBe('Live tracking needs a sign-in · saved as a journal entry, times as printed');
    expect(status({ plan: { kind: 'journal' }, lookupError: new FlightLookupError('missing', 404) }).text)
      .toBe('No live record for this flight · saved as a journal entry, times as printed');
    expect(status({ plan: { kind: 'journal' } }).text).toBe('Outside live lookup · saved as a journal entry, times as printed');
    expect(status({ plan: { kind: 'journal' }, edited: true }).text).toBe('Year changed by you · saved as printed');
  });

  it('reports a looked-up flight by what happened to it', () => {
    expect(status({}).text).toBe("Scheduled · we'll watch it for delays");
    expect(status({ plan: { kind: 'lookup', flight: flight({ landed: true, delayMinutes: 95 }) } })).toEqual({
      text: 'Arrived 95 min late · a verdict is waiting', tone: 'warn',
    });
    expect(status({ plan: { kind: 'lookup', flight: flight({ landed: true, delayMinutes: 0 }) } }).tone).toBe('good');
  });

  it.each(EVERY_SCENARIO)('never phrases the line as an instruction: %s', (_name, over) => {
    const { text } = status(over);
    expect(text).not.toMatch(IMPERATIVE_OPENERS);
    // Long lines are expected — they wrap on the card — but never a dangling
    // instruction like "— update boarding pass".
    expect(text).not.toMatch(/—\s*(update|save|add)\b/i);
  });
});
