/** What every surface shows once its countdown reaches zero.
 *
 * The Lock Screen, the Dynamic Island, the home screen's live card and the
 * trip page all count to the same instant, so they must all say the same
 * thing when it passes. This pins what each one does. */
import { liveCountdown } from '../../convex/liveShared';
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
