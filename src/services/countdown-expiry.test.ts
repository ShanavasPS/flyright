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
      expect(content.countdownEnd).toBe(Date.parse('2026-09-20T11:10Z'));
      expect(content.countdownEnd! < now.getTime()).toBe(true);
      expect(content.headline).toBe('Landing now');
    });

    it('the trip page says the same thing', () => {
      const clock = card(state, facts, now).clock;
      expect(clock).not.toBeNull();
      // It must not still be offering a countdown to an instant that passed:
      // that renders a "0:00" that never moves again.
      expect(clock!.kind).toBe('static');
      expect((clock as { value: string; unit: string }).value).toBe('Landing');
      expect((clock as { value: string; unit: string }).unit).toBe('now');
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
    // liveCountdown hands the widget an instant; the widget guards it, but a
    // payload whose clock is already spent should not be sent as one.
    const spent = liveCountdown('departed', Date.parse('2026-09-20T08:00Z'), Date.parse('2026-09-20T11:10Z'));
    expect(spent).not.toBeNull();
    expect(spent!.end).toBe(Date.parse('2026-09-20T11:10Z'));
  });
});
