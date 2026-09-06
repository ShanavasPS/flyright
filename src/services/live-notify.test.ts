import {
  SESSION_TTL_MS,
  STAGE_PUSH_FRESH_MS,
  shouldNotifyFollowers,
  tripIsOver,
} from '../../convex/liveShared';

const NOW = Date.parse('2026-09-06T09:00:00Z');
const fresh = new Date(NOW + SESSION_TTL_MS).toISOString();

describe('when a trip stops being live', () => {
  it('is over once 48 h past scheduled arrival', () => {
    expect(tripIsOver('2026-09-06T08:00Z', NOW)).toBe(false);
    expect(tripIsOver(new Date(NOW - SESSION_TTL_MS + 60_000).toISOString(), NOW)).toBe(false);
    expect(tripIsOver('2026-08-27T13:40Z', NOW)).toBe(true);
  });

  it('treats an unparseable arrival as arriving now', () => {
    expect(tripIsOver('not a date', NOW)).toBe(false);
  });
});

describe('the follower push gate', () => {
  it('lets a stage through while it is still news', () => {
    expect(
      shouldNotifyFollowers(
        {
          kind: 'stage',
          currentStage: 'boarded',
          stageTimes: { boarded: '2026-09-06T08:55:00Z' },
          expiresAt: fresh,
        },
        NOW,
      ),
    ).toBe(true);
  });

  it('drops a stage stamped long ago — backfill, not an event', () => {
    const stale = new Date(NOW - STAGE_PUSH_FRESH_MS - 60_000).toISOString();
    expect(
      shouldNotifyFollowers(
        { kind: 'stage', currentStage: 'landed', stageTimes: { landed: stale }, expiresAt: fresh },
        NOW,
      ),
    ).toBe(false);
  });

  it('drops anything on a session that has already expired', () => {
    // The 1.0.22 bug: a 27 Aug trip re-uploaded on 6 Sep opened a session that
    // was born expired and pushed "landed in FRA" to the traveler's circle.
    const args = {
      currentStage: 'landed',
      stageTimes: { landed: '2026-08-27T13:49Z' },
      expiresAt: '2026-08-29T13:40:00.000Z',
    };
    expect(shouldNotifyFollowers({ ...args, kind: 'stage' }, NOW)).toBe(false);
    expect(shouldNotifyFollowers({ ...args, kind: 'delay' }, NOW)).toBe(false);
    expect(shouldNotifyFollowers({ ...args, kind: 'gate' }, NOW)).toBe(false);
    expect(shouldNotifyFollowers({ ...args, kind: 'headsUp' }, NOW)).toBe(false);
    // A removed trip is always worth telling the circle about.
    expect(shouldNotifyFollowers({ ...args, kind: 'removed' }, NOW)).toBe(true);
  });

  it('lets a stage with no stamp through — it was reached now by definition', () => {
    expect(
      shouldNotifyFollowers(
        { kind: 'stage', currentStage: 'security', stageTimes: {}, expiresAt: fresh },
        NOW,
      ),
    ).toBe(true);
  });
});
