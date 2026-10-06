import { hasRecentCompletedFlight, shouldAskForReview, type ReviewHistory, type ReviewJourney } from '@/services/review-moment';

const NOW = Date.parse('2026-08-25T18:00Z');
const DAY = 86_400_000;

function flight(overrides: Partial<ReviewJourney> = {}): ReviewJourney {
  return {
    mode: 'flight',
    source: 'lookup',
    fromCode: 'HEL',
    toCode: 'LHR',
    scheduledDeparture: '2026-08-25T08:00Z',
    scheduledArrival: '2026-08-25T10:35Z',
    createdAt: '2026-08-01T12:00:00Z',
    ...overrides,
  };
}

const seasoned: ReviewHistory = { firstSeenAt: NOW - 30 * DAY, lastAskedAt: null, lastAskedVersion: null };

describe('hasRecentCompletedFlight', () => {
  it('counts a flight added ahead that landed hours ago', () => {
    expect(hasRecentCompletedFlight([flight()], NOW)).toBe(true);
  });

  it('waits until the traveller is off the plane', () => {
    expect(hasRecentCompletedFlight([flight()], Date.parse('2026-08-25T11:30Z'))).toBe(false);
  });

  it('lets a trip go stale after a week', () => {
    expect(hasRecentCompletedFlight([flight()], NOW + 8 * DAY)).toBe(false);
  });

  it('ignores trips imported after they flew', () => {
    expect(hasRecentCompletedFlight([flight({ createdAt: '2026-08-25T15:00:00Z' })], NOW)).toBe(false);
  });

  it('ignores trains and trips saved without times', () => {
    expect(hasRecentCompletedFlight([flight({ mode: 'train' as ReviewJourney['mode'] })], NOW)).toBe(false);
    expect(
      hasRecentCompletedFlight(
        [flight({ source: 'manual', scheduledDeparture: '2026-08-25T12:00:00', scheduledArrival: '2026-08-25T12:00:00' })],
        NOW,
      ),
    ).toBe(false);
  });
});

describe('shouldAskForReview', () => {
  it('asks after a completed trip', () => {
    expect(shouldAskForReview([flight()], seasoned, '1.2.2', NOW)).toBe(true);
  });

  it('never in the first three days', () => {
    expect(shouldAskForReview([flight()], { ...seasoned, firstSeenAt: NOW - 2 * DAY }, '1.2.2', NOW)).toBe(false);
  });

  it('never twice on one version, nor within four months', () => {
    expect(shouldAskForReview([flight()], { ...seasoned, lastAskedAt: NOW - 200 * DAY, lastAskedVersion: '1.2.2' }, '1.2.2', NOW)).toBe(false);
    expect(shouldAskForReview([flight()], { ...seasoned, lastAskedAt: NOW - 60 * DAY, lastAskedVersion: '1.2.1' }, '1.2.2', NOW)).toBe(false);
    expect(shouldAskForReview([flight()], { ...seasoned, lastAskedAt: NOW - 130 * DAY, lastAskedVersion: '1.2.1' }, '1.2.2', NOW)).toBe(true);
  });

  it('holds off while another flight leaves soon', () => {
    const next = flight({ scheduledDeparture: '2026-08-25T21:00Z', scheduledArrival: '2026-08-25T23:00Z' });
    expect(shouldAskForReview([flight(), next], seasoned, '1.2.2', NOW)).toBe(false);
  });
});
