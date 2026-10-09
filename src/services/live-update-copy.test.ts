import { actionButtonLabel, liveUpdateLines } from './live-update-copy';

describe('liveUpdateLines', () => {
  it('puts the clock label and the one fact in the title, the sub line under it', () => {
    expect(
      liveUpdateLines({ clockLabel: 'DEPARTS IN', lead: { label: 'GATE', value: '53', sub: 'Boards 15:30', subStruck: false }, delayChip: null }),
    ).toEqual({ title: 'Departs in · Gate 53', text: 'Boards 15:30', strike: '' });
    expect(
      liveUpdateLines({ clockLabel: 'DEPARTS IN', lead: { label: 'CHECK-IN', value: 'A200', sub: 'Terminal 2', subStruck: false }, delayChip: null }),
    ).toEqual({ title: 'Departs in · Check-in A200', text: 'Terminal 2', strike: '' });
    expect(
      liveUpdateLines({ clockLabel: 'LANDED 17:08', lead: { label: 'BAGGAGE', value: 'Belt 7', sub: '', subStruck: false }, delayChip: null }),
    ).toEqual({ title: 'Landed 17:08 · Belt 7', text: '', strike: '' });
  });

  it('adds the second fact after the first', () => {
    expect(
      liveUpdateLines({
        clockLabel: 'DEPARTS IN',
        lead: { label: 'GATE', value: '53', sub: 'Boards 15:30', subStruck: false },
        second: { label: 'SEAT', value: '14A' },
        delayChip: null,
      }),
    ).toEqual({ title: 'Departs in · Gate 53 · Seat 14A', text: 'Boards 15:30', strike: '' });
    expect(
      liveUpdateLines({
        clockLabel: 'LANDS IN',
        lead: { label: 'SEAT', value: '14A', sub: '', subStruck: false },
        second: { label: 'BAGGAGE', value: 'Belt 7' },
        delayChip: null,
      }).title,
    ).toBe('Lands in · Seat 14A · Belt 7');
  });

  it('leads the text with the delay chip, and stands alone without a fact', () => {
    expect(
      liveUpdateLines({ clockLabel: 'DEPARTS IN', lead: { label: 'GATE', value: '53', sub: 'Was 15:14', subStruck: false }, delayChip: '+46 min' }),
    ).toEqual({ title: 'Departs in · Gate 53', text: '+46 min · Was 15:14', strike: '' });
    expect(liveUpdateLines({ clockLabel: 'LANDS IN', lead: null, delayChip: null })).toEqual({ title: 'Lands in', text: '', strike: '' });
    expect(
      liveUpdateLines({ clockLabel: 'LANDS IN', lead: { label: 'SEAT', value: '14A', sub: '', subStruck: false }, delayChip: null }).title,
    ).toBe('Lands in · Seat 14A');
  });
});

describe('liveUpdateLines — without a countdown the label names the moment', () => {
  it('says "Departing now" and "Landing now" once the clock has retired', () => {
    expect(liveUpdateLines({ clockLabel: 'DEPARTS IN', lead: null, delayChip: null, countdownEnd: null }).title).toBe('Departing now');
    expect(
      liveUpdateLines({ clockLabel: 'LANDS IN', lead: { label: 'SEAT', value: '14A', sub: '', subStruck: false }, delayChip: null, countdownEnd: null }).title,
    ).toBe('Landing now · Seat 14A');
  });

  it('keeps "Departs in" while a countdown runs, and for callers that do not say', () => {
    expect(liveUpdateLines({ clockLabel: 'DEPARTS IN', lead: null, delayChip: null, countdownEnd: 1_800_000_000_000 }).title).toBe('Departs in');
    expect(liveUpdateLines({ clockLabel: 'DEPARTS IN', lead: null, delayChip: null }).title).toBe('Departs in');
    expect(liveUpdateLines({ clockLabel: 'LANDED 17:08', lead: null, delayChip: null, countdownEnd: null }).title).toBe('Landed 17:08');
  });

  it('keeps a 12-hour time in capitals', () => {
    expect(
      liveUpdateLines({ clockLabel: 'LANDED 5:11 AM', lead: { label: 'BAGGAGE', value: 'Belt 7', sub: '', subStruck: false }, delayChip: null }).title,
    ).toBe('Landed 5:11 AM · Belt 7');
    expect(liveUpdateLines({ clockLabel: 'LANDED 11:40PM', lead: null, delayChip: null }).title).toBe('Landed 11:40PM');
  });

  it('names the crossed-out part of the text', () => {
    const late = liveUpdateLines({
      clockLabel: 'DEPARTS IN',
      lead: { label: 'GATE', value: '22', sub: 'Boards 7:55 AM', subStruck: true },
      delayChip: '+46 min',
    });
    expect(late).toMatchObject({ text: '+46 min · Boards 7:55 AM', strike: 'Boards 7:55 AM' });
    expect(liveUpdateLines({ clockLabel: 'DEPARTS IN', lead: { label: 'GATE', value: '22', sub: 'Boards 7:55 AM', subStruck: false }, delayChip: null }).strike).toBe('');
  });
});

describe('actionButtonLabel', () => {
  const step = (label: string) => ({ label, question: null });
  it('keeps the words that fit and trims the two that Android would cut', () => {
    expect(actionButtonLabel(step("I'm at the airport"))).toBe("I'm at the airport");
    expect(actionButtonLabel(step("I'm on board"))).toBe("I'm on board");
    expect(actionButtonLabel(step("I'm through security"))).toBe('Through security');
    expect(actionButtonLabel(step("I'm through immigration"))).toBe('Through immigration');
  });

  it("gives a question's Yes its subject, since the button stands alone", () => {
    expect(actionButtonLabel({ label: 'Yes', question: 'Taken off?' })).toBe('Yes, taken off');
    expect(actionButtonLabel({ label: 'Yes', question: 'Landed?' })).toBe('Yes, landed');
  });
});
