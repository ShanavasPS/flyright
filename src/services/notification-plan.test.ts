import {
  delayTier,
  formatDelay,
  outranks,
  planReminders,
  type ReminderClaim,
  type ReminderJourney,
} from '@/services/notification-plan';
import type { Journey } from '@/rules/types';

const NOW = new Date('2026-08-20T12:00:00Z');
const DAY_MS = 86_400_000;

function journey(overrides: Partial<ReminderJourney> = {}): ReminderJourney {
  return {
    id: 'AY1331-2026-08-25',
    number: 'AY1331',
    carrier: 'Finnair',
    toCode: 'LHR',
    source: 'lookup',
    scheduledDeparture: '2026-08-25T10:15:00Z',
    scheduledArrival: '2026-08-25T13:20:00Z',
    ...overrides,
  };
}

function claim(overrides: Partial<ReminderClaim> = {}): ReminderClaim {
  return {
    id: 'claim-AY1331-2026-08-10',
    status: 'sent',
    responseDeadline: new Date(NOW.getTime() + 30 * DAY_MS).toISOString(),
    amount: 400,
    currency: 'EUR',
    journey: journey(),
    ...overrides,
  };
}

describe('planReminders — trips', () => {
  it('schedules a reminder 24h before departure, deep-linking to the journey', () => {
    const plan = planReminders([journey()], [], NOW);
    expect(plan).toHaveLength(1);
    expect(plan[0].id).toBe('trip-AY1331-2026-08-25');
    expect(plan[0].fireDate.toISOString()).toBe('2026-08-24T10:15:00.000Z');
    expect(plan[0].url).toBe('/journey/AY1331-2026-08-25');
    expect(plan[0].title).toContain('AY1331');
  });

  it('skips trips whose reminder moment has already passed', () => {
    const soon = journey({ scheduledDeparture: new Date(NOW.getTime() + 3600_000).toISOString() });
    const past = journey({ id: 'old', scheduledDeparture: '2026-08-01T10:00:00Z' });
    expect(planReminders([soon, past], [], NOW)).toHaveLength(0);
  });

  it('omits the fabricated noon time on time-less manual entries', () => {
    const manual = journey({
      source: 'manual',
      scheduledDeparture: '2026-08-25T12:00:00',
      scheduledArrival: '2026-08-25T12:00:00',
    });
    const [reminder] = planReminders([manual], [], NOW);
    expect(reminder.body).not.toContain('Departs');
  });

  it('falls back to the carrier name for number-less journal entries', () => {
    const [reminder] = planReminders([journey({ number: '' })], [], NOW);
    expect(reminder.title).toContain('Finnair');
  });
});

describe('planReminders — claims', () => {
  it('schedules the week-left and deadline pair for a sent claim', () => {
    const c = claim();
    const plan = planReminders([], [c], NOW);
    expect(plan.map((r) => r.id)).toEqual([`claim-week-${c.id}`, `claim-due-${c.id}`]);
    const deadline = Date.parse(c.responseDeadline!);
    expect(plan[0].fireDate.getTime()).toBe(deadline - 7 * DAY_MS);
    expect(plan[1].fireDate.getTime()).toBe(deadline);
    expect(plan[0].body).toContain('400 EUR');
    expect(plan[1].url).toBe('/claims');
  });

  it('drops only the week reminder once inside the final week', () => {
    const c = claim({ responseDeadline: new Date(NOW.getTime() + 3 * DAY_MS).toISOString() });
    const plan = planReminders([], [c], NOW);
    expect(plan.map((r) => r.id)).toEqual([`claim-due-${c.id}`]);
  });

  it('ignores drafts and claims past their deadline', () => {
    const draft = claim({ status: 'draft' });
    const overdue = claim({
      id: 'claim-old',
      responseDeadline: new Date(NOW.getTime() - DAY_MS).toISOString(),
    });
    expect(planReminders([], [draft, overdue], NOW)).toHaveLength(0);
  });
});

describe('delay tiers', () => {
  const domainJourney: Journey = {
    id: 'AY1331-2026-08-25',
    mode: 'flight',
    carrier: 'Finnair',
    carrierCountry: 'FI',
    number: 'AY1331',
    from: { code: 'HEL', country: 'FI' },
    to: { code: 'LHR', country: 'GB' },
    distanceKm: 1850,
    scheduledDeparture: '2026-08-25T10:15:00Z',
    scheduledArrival: '2026-08-25T13:20:00Z',
  };

  it('stays quiet under 30 minutes, informs from 30, pays from EU261 territory', () => {
    expect(delayTier(domainJourney, 15)).toBe('none');
    expect(delayTier(domainJourney, 45)).toBe('info');
    expect(delayTier(domainJourney, 195)).toBe('money');
  });

  it('only escalates upward', () => {
    expect(outranks('info', 'none')).toBe(true);
    expect(outranks('money', 'info')).toBe(true);
    expect(outranks('info', 'info')).toBe(false);
    expect(outranks('info', 'money')).toBe(false);
  });

  it('formats delays the way a departure board would', () => {
    expect(formatDelay(45)).toBe('45 min');
    expect(formatDelay(120)).toBe('2h');
    expect(formatDelay(195)).toBe('3h 15m');
  });
});
