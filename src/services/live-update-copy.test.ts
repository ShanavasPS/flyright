import { liveUpdateLines } from './live-update-copy';

describe('liveUpdateLines', () => {
  it('puts the clock label and the one fact in the title, the sub line under it', () => {
    expect(
      liveUpdateLines({ clockLabel: 'DEPARTS IN', lead: { label: 'GATE', value: '53', sub: 'Boards 15:30' }, delayChip: null }),
    ).toEqual({ title: 'Departs in · Gate 53', text: 'Boards 15:30' });
    expect(
      liveUpdateLines({ clockLabel: 'DEPARTS IN', lead: { label: 'CHECK-IN', value: 'A200', sub: 'Terminal 2' }, delayChip: null }),
    ).toEqual({ title: 'Departs in · Check-in A200', text: 'Terminal 2' });
    expect(
      liveUpdateLines({ clockLabel: 'LANDED 17:08', lead: { label: 'BAGGAGE', value: 'Belt 7', sub: '' }, delayChip: null }),
    ).toEqual({ title: 'Landed 17:08 · Belt 7', text: '' });
  });

  it('leads the text with the delay chip, and stands alone without a fact', () => {
    expect(
      liveUpdateLines({ clockLabel: 'DEPARTS IN', lead: { label: 'GATE', value: '53', sub: 'Was 15:14' }, delayChip: '+46 min' }),
    ).toEqual({ title: 'Departs in · Gate 53', text: '+46 min · Was 15:14' });
    expect(liveUpdateLines({ clockLabel: 'LANDS IN', lead: null, delayChip: null })).toEqual({ title: 'Lands in', text: '' });
    expect(
      liveUpdateLines({ clockLabel: 'LANDS IN', lead: { label: 'SEAT', value: '14A', sub: '' }, delayChip: null }).title,
    ).toBe('Lands in · Seat 14A');
  });
});

describe('liveUpdateLines — without a countdown the label names the moment', () => {
  it('says "Departing now" and "Landing now" once the clock has retired', () => {
    expect(liveUpdateLines({ clockLabel: 'DEPARTS IN', lead: null, delayChip: null, countdownEnd: null }).title).toBe('Departing now');
    expect(
      liveUpdateLines({ clockLabel: 'LANDS IN', lead: { label: 'SEAT', value: '14A', sub: '' }, delayChip: null, countdownEnd: null }).title,
    ).toBe('Landing now · Seat 14A');
  });

  it('keeps "Departs in" while a countdown runs, and for callers that do not say', () => {
    expect(liveUpdateLines({ clockLabel: 'DEPARTS IN', lead: null, delayChip: null, countdownEnd: 1_800_000_000_000 }).title).toBe('Departs in');
    expect(liveUpdateLines({ clockLabel: 'DEPARTS IN', lead: null, delayChip: null }).title).toBe('Departs in');
    expect(liveUpdateLines({ clockLabel: 'LANDED 17:08', lead: null, delayChip: null, countdownEnd: null }).title).toBe('Landed 17:08');
  });
});
