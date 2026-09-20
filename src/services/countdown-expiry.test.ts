/** What every surface shows once its countdown reaches zero.
 *
 * The Lock Screen, the Dynamic Island, the home screen's live card and the
 * trip page all count to the same instant, so they must all say the same
 * thing when it passes. This pins what each one does. */
import { clockEndsAt, clockStaleAt, liveCountdown } from '../../convex/liveShared';
import { EMPTY_FACTS, liveContent, type FlightFacts, type TravelDayState, type TravelJourney } from '@/services/travel-day';
import { tripCard } from '@/services/trip-card';
import type { JourneyRow } from '@/services/journeys';

const leg: TravelJourney = {
  id: 'AY1331-2026-09-20',
  mode: 'flight',
  source: 'lookup',
  number: 'AY1331',
  carrier: 'Finnair',
  fromCode: 'HEL',
  toCode: 'LHR',
  scheduledDeparture: '2026-09-20T08:00Z',
  scheduledArrival: '2026-09-20T11:10Z',
};

const row = {
  ...leg,
  distanceKm: 1827,
  fromCountry: 'FI',
  toCountry: 'GB',
  carrierCountry: 'FI',
  ticketedDeparture: null,
  ticketedArrival: null,
  passCode: null,
  seat: null,
} as unknown as JourneyRow;

const card = (state: TravelDayState, facts: FlightFacts, now: Date) =>
  tripCard({ row, facts, state, phase: 'live', now, statusKnown: true });

describe('the clock reaches zero', () => {
  describe('in the air, past the arrival it was counting to', () => {
    const state: TravelDayState = { stage: 'departed', stamps: { departed: '2026-09-20T08:05Z' } };
    const facts = { ...EMPTY_FACTS, actualDeparture: '2026-09-20T08:05Z' };
    const now = new Date('2026-09-20T11:40Z'); // half an hour past

    it('the live card stops counting and says where the flight is', () => {
      const content = liveContent(leg, state, facts, now);
      // No clock at all, rather than one anchored to an instant already gone:
      // the widget archives what it is sent and ticks it on the device.
      expect(content.countdownEnd).toBeNull();
      expect(content.countdownKind).toBeNull();
      expect(content.headline).toBe('Landing now');
    });

    it('the trip page says the same thing', () => {
      const clock = card(state, facts, now).clock;
      expect(clock).not.toBeNull();
      // It must not still be offering a countdown to an instant that passed:
      // that renders a "0:00" that never moves again.
      expect(clock!.kind).toBe('static');
      // The same words, under the same label, as the live card and the Lock
      // Screen show in their own clock slots at this moment.
      const live = liveContent(leg, state, facts, now);
      expect(live.clockLabel).toBe('LANDS IN');
      expect(live.headline).toBe('Landing now');
      const shown = clock as { label: string; value: string; unit: string };
      expect(shown.label).toBe('Lands in');
      expect(`${shown.value} ${shown.unit}`).toBe('Landing now');
      // ...and not a second copy of the status pill beside it.
      expect(shown.label).not.toBe(card(state, facts, now).status.text);
    });
  });

  describe('overdue, with nothing reporting a landing', () => {
    // QR516 DOH→COK, 2026-09-19: left 26 minutes late, Kochi never reported
    // an arrival. The clock ran out and stayed out.
    const state: TravelDayState = { stage: 'departed', stamps: { departed: '2026-09-20T08:05Z' } };
    const facts = { ...EMPTY_FACTS, actualDeparture: '2026-09-20T08:05Z' };

    it('waits out the late take-off before asking', () => {
      // Scheduled 08:00→11:10 is 3h10m of block; airborne at 08:05, so the
      // landing is reckoned at 11:15, and the ask comes 30 minutes after it.
      const soon = new Date('2026-09-20T11:40Z');
      expect(card(state, facts, soon).footnote).toBeNull();
      expect(liveContent(leg, state, facts, soon).subtitle).toBe('In the air');
    });

    it('then asks on the trip page and the live card together', () => {
      const late = new Date('2026-09-20T11:50Z');
      expect(liveContent(leg, state, facts, late).subtitle).toBe('Landed? Tap to confirm');
      expect(card(state, facts, late).footnote).toMatch(/^Landed\?/);
    });
  });

  describe('still at the gate, past the departure it was counting to', () => {
    const state: TravelDayState = { stage: 'boarded', stamps: { boarded: '2026-09-20T07:40Z' } };
    const now = new Date('2026-09-20T08:20Z'); // twenty minutes past

    it('re-anchors to the arrival instead of sitting on a spent clock', () => {
      // Nothing recorded the take-off, so the timetable presumes it
      // (presumedFlightStage) and every surface counts to the landing.
      const content = liveContent(leg, state, EMPTY_FACTS, now);
      expect(content.countdownEnd).toBe(Date.parse('2026-09-20T11:10Z'));
      expect(content.countdownEnd! > now.getTime()).toBe(true);
    });

    it('the trip page re-anchors to the same instant', () => {
      const clock = card(state, EMPTY_FACTS, now).clock;
      expect(clock!.kind).toBe('countdown');
      expect((clock as { end: number }).end).toBe(Date.parse('2026-09-20T11:10Z'));
    });

    it('a fresh status check holds it at the gate on both, with no clock at zero', () => {
      // heldOnGround: the airport says it has not left, so neither surface
      // presumes a take-off — and the trip card swaps the countdown for the
      // time it is due rather than showing one stuck at zero.
      const held = { ...EMPTY_FACTS, observedAt: '2026-09-20T08:15Z' };
      const model = card(state, held, now);
      expect(model.status.text).toBe('On board');
      expect(model.clock!.kind).toBe('static');
      expect((model.clock as { label: string }).label).toBe('Due to leave at');
    });
  });

  it('gives the widget no clock at all once the instant has passed', () => {
    const dep = Date.parse('2026-09-20T08:00Z');
    const arr = Date.parse('2026-09-20T11:10Z');
    // Still ahead: the anchor the widget counts to.
    expect(liveCountdown('departed', dep, arr, arr - 60_000)).toEqual({ end: arr, kind: 'arrival' });
    // Gone: nothing, so the widget shows its word instead of a clock it
    // would render frozen — and then garbled, once iOS drops an hour digit
    // from it and ClockText's fixed crop lands mid-number.
    expect(liveCountdown('departed', dep, arr, arr + 1)).toBeNull();
    expect(liveCountdown('boarded', dep, arr, dep + 1)).toBeNull();
    // Without a clock the push carries no stale date either — there is
    // nothing to go stale at.
    expect(liveCountdown('landed', dep, arr, dep)).toBeNull();
  });
});

describe('clockStaleAt — when the widget clock stops being right', () => {
  const now = Date.parse('2026-09-20T09:00:00Z');
  const at = (endIso: string) => clockStaleAt(Date.parse(endIso), now);

  it('has nothing to say without a countdown', () => {
    expect(clockStaleAt(0, now)).toBeNull();
    expect(clockStaleAt(null, now)).toBeNull();
    expect(clockStaleAt(undefined, now)).toBeNull();
  });

  it('lands on the ten-hour crossing while the flight is further out', () => {
    // 13h out: the clock changes shape 3h from now, not at take-off.
    expect(at('2026-09-20T22:00:00Z')).toBe(Date.parse('2026-09-20T12:00:00Z'));
  });

  it('lands on the countdown itself once inside ten hours', () => {
    expect(at('2026-09-20T15:30:00Z')).toBe(Date.parse('2026-09-20T15:30:00Z'));
  });

  it('takes the crossing only while it is still ahead', () => {
    // Exactly ten hours out: the crossing is now, so the end is next.
    expect(at('2026-09-20T19:00:00Z')).toBe(Date.parse('2026-09-20T19:00:00Z'));
  });

  it('still names the end after the countdown has run out', () => {
    // A stale date in the past is what tells iOS the card is already wrong.
    expect(at('2026-09-20T08:59:00Z')).toBe(Date.parse('2026-09-20T08:59:00Z'));
  });
});

describe('the moment the widget clock breaks, per session', () => {
  const base = {
    currentStage: null,
    fromCode: 'HEL',
    toCode: 'ARN',
    scheduledDeparture: '2026-09-20T12:00:00Z',
    scheduledArrival: '2026-09-20T14:00:00Z',
    stageTimes: {},
    plan: [],
    status: 'active',
    carrier: 'Finnair',
    number: 'AY77',
    delayMinutes: null,
    gate: null,
    terminal: null,
    baggageBelt: null,
    estimatedDeparture: null,
    actualDeparture: null,
    estimatedArrival: null,
    actualArrival: null,
    flightStatus: null,
  };

  it('is the departure when the flight is inside ten hours', () => {
    const now = Date.parse('2026-09-20T09:00:00Z');
    const end = clockEndsAt(base as never, now);
    expect(end).toBe(Date.parse('2026-09-20T12:00:00Z'));
    // Three hours out, nothing changes shape before take-off.
    expect(clockStaleAt(end, now)).toBe(end);
  });

  it('is the ten-hour crossing when the flight is further out', () => {
    const now = Date.parse('2026-09-19T23:00:00Z');
    const end = clockEndsAt(base as never, now);
    expect(clockStaleAt(end, now)).toBe(Date.parse('2026-09-20T02:00:00Z'));
  });

  it('has no deadline once every clock on the card is spent', () => {
    // Past the arrival: no countdown left, so nothing can go wrong.
    const now = Date.parse('2026-09-20T15:00:00Z');
    expect(clockEndsAt({ ...base, currentStage: 'landed' } as never, now)).toBeNull();
    expect(clockStaleAt(null, now)).toBeNull();
  });
});
