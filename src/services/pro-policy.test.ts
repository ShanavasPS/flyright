import { canSetProReminder, nextProTrip, proReminderTime } from '../../convex/proShared';
import { freeFlightDetails } from '../../convex/flightAccess';
import { liveMonitoring } from '../../convex/liveShared';
import { planPrice, sortPlans } from './pro-plans';
import type { PurchasesPackage } from 'react-native-purchases';

const trip = (departure: string, arrival: string) => ({ fromCode: 'HEL', toCode: 'LHR', scheduledDeparture: departure, scheduledArrival: arrival });

it('schedules exactly 48 hours before departure across the Helsinki daylight-saving change', () => {
  const journey = trip('2026-10-26T09:00:00', '2026-10-26T10:00:00Z');
  expect(new Date(proReminderTime(journey)).toISOString()).toBe('2026-10-24T07:00:00.000Z');
  expect(canSetProReminder(journey, Date.parse('2026-10-24T07:00:00Z'))).toBe(false);
});
it('selects only the next future flight, excluding empty journals, deleted, in-flight and past trips', () => {
  const old = trip('2026-09-01T08:00Z', '2026-09-01T11:00Z');
  const first = trip('2026-10-01T08:00Z', '2026-10-01T11:00Z');
  const second = trip('2026-10-08T08:00Z', '2026-10-08T11:00Z');
  const deleted = { ...trip('2026-09-29T08:00Z', '2026-09-29T11:00Z'), deletedAt: '2026-09-20' };
  const departed = trip('2026-09-23T07:00Z', '2026-09-23T11:00Z');
  const departingNow = trip('2026-09-23T08:00Z', '2026-09-23T11:00Z');
  const train = { ...trip('2026-09-24T08:00Z', '2026-09-24T11:00Z'), mode: 'train' };
  const now = Date.parse('2026-09-23T08:00Z');
  expect(nextProTrip([second, deleted, old, first, departed, departingNow, train], now)).toBe(first);
  expect(nextProTrip([old], now)).toBeNull();
  expect(nextProTrip([departed, departingNow, old], now)).toBeNull();
  expect(nextProTrip([], now)).toBeNull();
});
it('does not expose live data or future fields through the free lookup projection', () => {
  const facts = { flight: 'AY1', scheduledDeparture: '2099-01-01T08:00Z', gate: '12', terminal: '2', delayMinutes: 45, landed: false, position: { latitude: 60 }, inbound: { flight: 'AY2' }, secretFutureField: 'hidden' };
  const free = freeFlightDetails(facts);
  expect(free.flight).toBe('AY1');
  expect(free.scheduledDeparture).toBe(facts.scheduledDeparture);
  expect(free.delayMinutes).toBeNull();
  for (const field of ['gate', 'terminal', 'position', 'inbound', 'secretFutureField']) expect(free).not.toHaveProperty(field);
});
it('keeps final arrival delay free for manual checks, never a prediction or future actual time', () => {
  const facts = { landed: true, actualArrival: '2026-09-20T12:00Z', delayMinutes: 195 };
  expect(freeFlightDetails(facts, Date.parse('2026-09-21T00:00Z')).delayMinutes).toBe(195);
  expect(freeFlightDetails(facts, Date.parse('2026-09-19T00:00Z')).delayMinutes).toBeNull();
  expect(freeFlightDetails({ ...facts, landed: false }).delayMinutes).toBeNull();
});
it('ends the live label at the owner’s paid-through time', () => {
  expect(liveMonitoring({ monitoringUntil: 100 }, 99)).toBe(true);
  expect(liveMonitoring({ monitoringUntil: 100 }, 100)).toBe(false);
});
it('puts monthly first without changing store prices or assuming a currency', () => {
  const plans = [
    { packageType: 'ANNUAL', product: { priceString: '39,99 €', subscriptionPeriod: 'P1Y' } },
    { packageType: 'LIFETIME', product: { priceString: '¥12,000', subscriptionPeriod: null } },
    { packageType: 'MONTHLY', product: { priceString: '₹499.00', subscriptionPeriod: 'P1M' } },
  ] as PurchasesPackage[];
  const sorted = sortPlans(plans);
  expect(sorted[0]).toBe(plans[2]);
  expect(planPrice(sorted[0])).toBe('₹499.00 / month');
  expect(planPrice(sorted[1])).toBe('39,99 € / year');
  expect(planPrice(sorted[2])).toBe('¥12,000');
});
