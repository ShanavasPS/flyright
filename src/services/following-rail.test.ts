import type { PublicSession } from '../../convex/liveShared';

import { railStatus } from './following-rail';

const now = new Date('2026-09-09T05:00:00Z');
const base: PublicSession = {
  status: 'active',
  travelerName: 'Sam',
  followerCount: 1,
  carrier: 'Finnair',
  number: 'AY1331',
  fromCode: 'HEL',
  toCode: 'LHR',
  scheduledDeparture: '2026-09-09T06:00:00Z',
  scheduledArrival: '2026-09-09T09:15:00Z',
  currentStage: null,
  stageTimes: {},
  flightStatus: null,
  delayMinutes: null,
  gate: null,
  terminal: null,
  baggageBelt: null,
  estimatedDeparture: null,
  actualDeparture: null,
  estimatedArrival: null,
  actualArrival: null,
};

describe('railStatus', () => {
  it('counts down to take-off with an empty ring before the airport', () => {
    expect(railStatus(base, [], now)).toEqual({
      ring: 0,
      tone: 'live',
      badge: null,
      label: '1h',
      icon: 'takeoff',
    });
  });

  it('fills the walk share as the traveller taps through the airport', () => {
    const s = railStatus({ ...base, currentStage: 'security', gate: '22' }, [], now);
    // The default walk is all six airport stages; security is the fourth.
    expect(s.ring).toBeCloseTo(0.3 * (4 / 6));
    expect(s.badge).toEqual({ kind: 'gate', gate: '22' });
  });

  it('says Boarded once on board', () => {
    const s = railStatus({ ...base, currentStage: 'boarded' }, [], now);
    expect(s.label).toBe('Boarded');
    expect(s.icon).toBeNull();
    expect(s.ring).toBeCloseTo(0.3);
  });

  it('counts down to the landing in the air, amber when half an hour late', () => {
    const s = railStatus(
      {
        ...base,
        currentStage: 'departed',
        delayMinutes: 40,
        actualDeparture: '2026-09-09T04:00:00Z',
        estimatedArrival: '2026-09-09T07:00:00Z',
      },
      [],
      now,
    );
    expect(s).toMatchObject({ label: '2h', icon: 'landing', tone: 'late', badge: { kind: 'plane' } });
    expect(s.ring).toBeGreaterThan(0.3);
    expect(s.ring).toBeLessThan(1);
  });

  it('is done once landed — and only Flown when the timetable alone says so', () => {
    expect(railStatus({ ...base, currentStage: 'landed' }, [], now)).toMatchObject({
      label: 'Landed',
      tone: 'done',
      ring: 1,
      badge: { kind: 'check' },
    });
    expect(railStatus(base, [], new Date('2026-09-09T10:00:00Z'))).toMatchObject({
      label: 'Flown',
      tone: 'done',
    });
  });

  it('becomes the next leg while a connection is still to leave', () => {
    const s = railStatus(
      { ...base, currentStage: 'landed' },
      [
        {
          number: 'BA117',
          carrier: 'British Airways',
          fromCode: 'LHR',
          toCode: 'JFK',
          scheduledDeparture: '2026-09-09T07:30:00',
          scheduledArrival: '2026-09-09T10:30:00',
        },
      ],
      now,
    );
    // 07:30 London (BST) is 06:30Z, an hour and a half away.
    expect(s).toMatchObject({ label: '1h 30m', icon: 'takeoff', tone: 'live', ring: 0 });
  });
});
