import {
  followerStatus,
  liveTimes,
  movedClocks,
  onHomeScreen,
  presumedStage,
  spanLabel,
  travellerEyebrow,
} from './public-session';

const now = new Date('2026-09-09T05:00:00Z');
const base = {
  fromCode: 'HEL',
  toCode: 'LHR',
  currentStage: null as string | null,
  delayMinutes: null as number | null,
  gate: null as string | null,
  terminal: null as string | null,
  baggageBelt: null as string | null,
  scheduledDeparture: '2026-09-09T06:00:00Z',
  scheduledArrival: '2026-09-09T09:15:00Z',
  estimatedDeparture: null as string | null,
  actualDeparture: null as string | null,
  estimatedArrival: null as string | null,
  actualArrival: null as string | null,
};

describe('spanLabel', () => {
  it('counts minutes, then hours and minutes, then days', () => {
    expect(spanLabel(45 * 60_000)).toBe('45m');
    expect(spanLabel(20_000)).toBe('1m');
    expect(spanLabel(2 * 3_600_000 + 15 * 60_000)).toBe('2h 15m');
    expect(spanLabel(3 * 3_600_000)).toBe('3h');
    expect(spanLabel(3 * 86_400_000 + 3_600_000)).toBe('3d');
  });
});

describe('followerStatus', () => {
  it('counts down to departure with the gate, and nothing else before the first stage', () => {
    expect(followerStatus(base, now)).toEqual({ headline: 'Departs in 1h', detail: null, delayed: false });
    expect(followerStatus({ ...base, gate: '44' }, now)).toEqual({
      headline: 'Departs in 1h',
      detail: 'Gate 44',
      delayed: false,
    });
  });
  it('names the stage reached, and a delay over the gate', () => {
    expect(followerStatus({ ...base, currentStage: 'boarded', gate: '44' }, now).detail).toBe(
      'On board · Gate 44',
    );
    expect(
      followerStatus(
        { ...base, currentStage: 'boarded', gate: '44', delayMinutes: 45, estimatedDeparture: '2026-09-09T06:45:00Z' },
        now,
      ),
    ).toEqual({ headline: 'Departs in 1h 45m', detail: 'On board · 45 min late', delayed: true });
  });
  it('switches to the landing countdown in the air', () => {
    expect(
      followerStatus(
        { ...base, currentStage: 'departed', actualDeparture: '2026-09-09T06:05:00Z', estimatedArrival: '2026-09-09T05:40:00Z' },
        now,
      ),
    ).toEqual({ headline: 'Lands in 40m', detail: 'In the air', delayed: false });
    expect(
      followerStatus({ ...base, currentStage: 'departed', estimatedArrival: '2026-09-09T05:00:30Z' }, now)
        .headline,
    ).toBe('Landing now');
  });
  it('reports the landing time and where the bags are', () => {
    const landed = followerStatus(
      { ...base, currentStage: 'landed', actualArrival: '2026-09-09T08:55:00Z', baggageBelt: '7' },
      now,
    );
    expect(landed.headline).toMatch(/^Landed /);
    expect(landed.detail).toBe('Bags at belt 7');
    expect(
      followerStatus({ ...base, currentStage: 'landed', terminal: '2' }, now).detail,
    ).toBe('Terminal 2');
  });
  it('reads the timetable once the departure has gone with nothing recorded', () => {
    // Biswas's manual COK→TUC trip: no flight number to poll, no taps, and
    // bare wall clocks — the row sat on "Departing now" for two days.
    const manual = {
      ...base,
      fromCode: 'COK',
      toCode: 'TUC',
      scheduledDeparture: '2026-09-10T12:00:00',
      scheduledArrival: '2026-09-11T07:00:00',
    };
    // 12:00 at COK is 06:30Z; a minute either side is still "now".
    expect(followerStatus(manual, new Date('2026-09-10T06:30:30Z')).headline).toBe('Departing now');
    // 07:00 at TUC is 10:00Z; two hours before, presumed in the air.
    expect(followerStatus(manual, new Date('2026-09-11T08:00:00Z'))).toEqual({
      headline: 'Due to land in 2h',
      detail: 'Going by the timetable',
      delayed: false,
    });
    expect(
      followerStatus({ ...manual, currentStage: 'boarded' }, new Date('2026-09-11T08:00:00Z')).detail,
    ).toBe('On board · going by the timetable');
    // The day after: flown, with the due time so the reader knows what it was.
    const flown = followerStatus(manual, new Date('2026-09-11T12:00:00Z'));
    expect(flown.headline).toBe('Flown');
    expect(flown.detail).toMatch(/^Due to land .*going by the timetable$/);
  });
});

describe('presumedStage', () => {
  it('never second-guesses a recorded stage past the airport', () => {
    expect(presumedStage({ ...base, currentStage: 'departed' }, new Date('2026-09-12T00:00:00Z'))).toBe('departed');
    expect(presumedStage({ ...base, currentStage: 'landed' }, now)).toBe('landed');
  });
  it('follows the clocks the airline now says', () => {
    expect(presumedStage(base, now)).toBeNull();
    expect(presumedStage(base, new Date('2026-09-09T06:02:00Z'))).toBe('departed');
    expect(presumedStage({ ...base, estimatedDeparture: '2026-09-09T06:30:00Z' }, new Date('2026-09-09T06:02:00Z'))).toBeNull();
    expect(presumedStage(base, new Date('2026-09-09T09:17:00Z'))).toBe('landed');
  });
});

describe('travellerEyebrow', () => {
  it("says 'is flying' until landed, and neither once only the timetable says so", () => {
    expect(travellerEyebrow('Sam', base, now)).toBe('Sam is flying');
    expect(travellerEyebrow('Sam', { ...base, currentStage: 'landed' }, now)).toBe('Sam has landed');
    expect(travellerEyebrow('Sam', base, new Date('2026-09-09T12:00:00Z'))).toBe("Sam's trip");
  });
});

describe('liveTimes', () => {
  it('prefers actual, then estimated, then scheduled', () => {
    expect(
      liveTimes({ ...base, estimatedDeparture: 'E1', actualDeparture: 'A1', estimatedArrival: 'E2' }),
    ).toEqual({ departure: 'A1', arrival: 'E2' });
    expect(liveTimes(base)).toEqual({ departure: base.scheduledDeparture, arrival: base.scheduledArrival });
  });
});

describe('movedClocks', () => {
  it('surfaces the timetable only once the airline moved the flight by five minutes or more', () => {
    expect(movedClocks(base)).toEqual({ ticketedDeparture: null, ticketedArrival: null });
    expect(movedClocks({ ...base, estimatedDeparture: '2026-09-09T06:03:00Z' }).ticketedDeparture).toBeNull();
    expect(movedClocks({ ...base, estimatedDeparture: '2026-09-09T06:45:00Z' })).toEqual({
      ticketedDeparture: base.scheduledDeparture,
      ticketedArrival: null,
    });
    expect(movedClocks({ ...base, actualArrival: '2026-09-09T08:55:00Z' }).ticketedArrival).toBe(
      base.scheduledArrival,
    );
  });
});

describe('onHomeScreen', () => {
  const at = (iso: string) => new Date(iso);
  const stamped = { ...base, stageTimes: {} as Record<string, string> };
  it('keeps a trip on the home screen until it lands', () => {
    expect(onHomeScreen(stamped, now)).toBe(true);
    expect(onHomeScreen({ ...stamped, currentStage: 'departed' }, at('2026-09-09T20:00:00Z'))).toBe(true);
  });
  it('lets a landed trip go two hours after the landing stamp', () => {
    const landed = { ...stamped, currentStage: 'landed', stageTimes: { landed: '2026-09-09T05:00:00Z' } };
    expect(onHomeScreen(landed, at('2026-09-09T06:59:00Z'))).toBe(true);
    expect(onHomeScreen(landed, at('2026-09-09T07:01:00Z'))).toBe(false);
  });
  it("falls back to the airline's actual arrival, and stays when neither is known", () => {
    expect(
      onHomeScreen(
        { ...stamped, currentStage: 'landed', actualArrival: '2026-09-09T05:00:00Z' },
        at('2026-09-09T08:00:00Z'),
      ),
    ).toBe(false);
    expect(onHomeScreen({ ...stamped, currentStage: 'landed' }, now)).toBe(true);
  });
  it('lets a trip nobody recorded landing go two hours after the timetable arrival', () => {
    // Scheduled arrival 09:15Z with no stage at all.
    expect(onHomeScreen(stamped, at('2026-09-09T11:00:00Z'))).toBe(true);
    expect(onHomeScreen(stamped, at('2026-09-09T11:20:00Z'))).toBe(false);
    // ...unless a connecting leg is still to leave.
    expect(
      onHomeScreen(stamped, at('2026-09-09T11:20:00Z'), [
        { scheduledDeparture: '2026-09-09T13:00:00Z', fromCode: 'LHR' },
      ]),
    ).toBe(true);
  });
});
