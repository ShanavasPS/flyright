import { hasAssistantBoardingPass, isAssistantAction, nextAssistantFlight } from './assistant-actions';
import type { JourneyRow } from './journeys';

const now = Date.parse('2026-09-14T10:00:00Z');
function flight(id: string, patch: Partial<JourneyRow> = {}): JourneyRow {
  return {
    id, userId: 'alice', mode: 'flight', fromCode: 'HEL', toCode: 'LHR',
    scheduledDeparture: '2026-09-14T11:00:00Z', scheduledArrival: '2026-09-14T14:00:00Z',
    deletedAt: null, passCode: null, passFormat: null, ...patch,
  } as JourneyRow;
}

it('only accepts the three supported actions', () => {
  for (const action of ['next-flight', 'boarding-pass', 'add-flight']) expect(isAssistantAction(action)).toBe(true);
  for (const action of [undefined, ['next-flight'], 'delete-trip', 'https://example.com']) expect(isAssistantAction(action)).toBe(false);
});

it('never resolves deleted trips, other accounts, or non-flight journeys', () => {
  const rows = [flight('other', { userId: 'bob' }), flight('deleted', { deletedAt: '2026-09-13' }), flight('train', { mode: 'train' })];
  expect(nextAssistantFlight(rows, 'alice', now)).toBeUndefined();
  expect(nextAssistantFlight([flight('signed-in')], null, now)).toBeUndefined();
  expect(nextAssistantFlight([flight('local', { userId: null })], null, now)?.id).toBe('local');
});

it('orders by airport-local instants, not creation order or the device timezone', () => {
  const later = flight('later', { scheduledDeparture: '2026-09-14T12:00:00Z' });
  const earlier = flight('earlier', { fromCode: 'COK', scheduledDeparture: '2026-09-14T16:00:00' }); // 10:30 UTC
  expect(nextAssistantFlight([later, earlier], 'alice', now)?.id).toBe('earlier');
});

it('keeps an ongoing flight until arrival and excludes past or invalid flights', () => {
  const ongoing = flight('ongoing', { scheduledDeparture: '2026-09-14T09:00:00Z' });
  const past = flight('past', { scheduledDeparture: '2026-09-14T07:00:00Z', scheduledArrival: '2026-09-14T10:00:00Z' });
  const invalid = flight('invalid', { scheduledDeparture: 'bad-date' });
  expect(nextAssistantFlight([flight('next'), past, invalid, ongoing], 'alice', now)?.id).toBe('ongoing');
  expect(nextAssistantFlight([past, invalid], 'alice', now)).toBeUndefined();
});

it('requires a saved boarding-pass barcode and a supported format', () => {
  expect(hasAssistantBoardingPass(flight('pass', { passCode: 'code', passFormat: 'QR' }))).toBe(true);
  for (const patch of [{ passCode: 'code' }, { passCode: ' ', passFormat: 'QR' }, { ticketCode: 'code', ticketFormat: 'QR' }, { passCode: 'code', passFormat: 'unknown' }]) {
    expect(hasAssistantBoardingPass(flight('missing', patch))).toBe(false);
  }
});

it('does not substitute a later flight when the next flight has no pass', () => {
  const next = flight('next');
  const later = flight('later', { scheduledDeparture: '2026-09-14T12:00:00Z', passCode: 'code', passFormat: 'QR' });
  const chosen = nextAssistantFlight([later, next], 'alice', now)!;
  expect(chosen.id).toBe('next');
  expect(hasAssistantBoardingPass(chosen)).toBe(false);
});
