import { liveMoments, rememberLive, type LiveMemory } from '@/services/live-moments';

type Snap = Parameters<typeof liveMoments>[1];

const checkIn: Snap = { delayLabel: null, gate: null, tone: 'normal', countdownKind: 'departure' };
const boarding: Snap = { ...checkIn, gate: 'B32', tone: 'boarding' };
const lastMinute: Snap = { ...boarding, tone: 'normal', countdownKind: null };
const air: Snap = { ...checkIn, countdownKind: 'arrival' };
const landed: Snap = { ...checkIn, tone: 'landed', countdownKind: null };

/** Feeds renders in order and collects what each one felt. */
function play(...snaps: Snap[]): string[][] {
  let memory: LiveMemory = rememberLive(snaps[0]);
  return snaps.slice(1).map((s) => {
    const step = liveMoments(memory, s);
    memory = step.memory;
    return step.moments;
  });
}

describe('liveMoments', () => {
  it('feels nothing for the first render, even of a landed flight', () => {
    expect(rememberLive(landed).phase).toBe('landed');
    expect(play(landed, landed)).toEqual([[]]);
  });

  it('walks a whole day: gate + boarding, take-off through the last minute, landing', () => {
    expect(play(checkIn, boarding, lastMinute, air, landed)).toEqual([
      ['boarding', 'gate'],
      [],
      ['takeOff'],
      ['landed'],
    ]);
  });

  it('does not replay take-off after a stale poll steps back to the ground', () => {
    expect(play(checkIn, air, checkIn, air)).toEqual([['takeOff'], [], []]);
  });

  it('feels landing even when the app never saw the flight in the air', () => {
    expect(play(checkIn, landed)).toEqual([['landed']]);
  });

  it('keeps the old delay and gate rules: each new value counts, clearing does not', () => {
    const late = { ...checkIn, delayLabel: '+25 min' };
    const later = { ...checkIn, delayLabel: '+40 min', gate: 'C4' };
    expect(play(checkIn, late, later, checkIn)).toEqual([['delay'], ['delay', 'gate'], []]);
  });

  it('reports a delay that arrives with the landing alongside it', () => {
    expect(play(air, { ...landed, delayLabel: '+46 min' })).toEqual([['landed', 'delay']]);
  });
});
