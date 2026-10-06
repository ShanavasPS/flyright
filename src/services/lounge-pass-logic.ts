/** Lounge passes and visits, pure (docs/lounges.md): which networks the app
 * knows, the membership year, free visits left and when to warn. The rows
 * live in services/lounge-passes; nothing here reads or writes them. */

import { type LoungeNetwork, type LoungePass, type Money } from '@/services/lounge-access';

export interface NetworkInfo {
  id: LoungeNetwork;
  name: string;
  /** Where the traveller opens their digital card. No network publishes a
   *  link into its app, so this is the store page (it shows "Open" when the
   *  app is installed) or the network's site. */
  ios: string;
  android: string;
  /** What the desk takes from this network. */
  desk: string;
}

export const NETWORKS: NetworkInfo[] = [
  {
    id: 'priority-pass',
    name: 'Priority Pass',
    ios: 'https://apps.apple.com/app/id406878019',
    android: 'https://play.google.com/store/search?q=Priority%20Pass&c=apps',
    desk: 'The desk scans the digital card in the Priority Pass app, or the plastic card.',
  },
  {
    id: 'dragonpass',
    name: 'DragonPass',
    ios: 'https://www.dragonpass.com',
    android: 'https://play.google.com/store/search?q=DragonPass&c=apps',
    desk: 'The desk scans the QR code in the DragonPass app.',
  },
  {
    id: 'loungekey',
    name: 'LoungeKey',
    ios: 'https://www.loungekey.com',
    android: 'https://www.loungekey.com',
    desk: 'The desk takes the payment card the benefit comes with.',
  },
  {
    id: 'mastercard-travel-pass',
    name: 'Mastercard Travel Pass',
    ios: 'https://www.mastercard.com/travelpass',
    android: 'https://www.mastercard.com/travelpass',
    desk: 'The desk scans the digital pass in the Mastercard Travel Pass app.',
  },
];

export function networkInfo(id: string): NetworkInfo | undefined {
  return NETWORKS.find((n) => n.id === id);
}

/** The pass columns this file reads (db/schema loungePasses). */
export interface PassLike {
  id: string;
  network: string;
  freeVisits: number | null;
  usedBefore: number;
  renewsOn: string | null;
  extraVisitCents: number | null;
  currency: string | null;
  createdAt: string;
}

/** The visit columns this file reads (db/schema loungeVisits). */
export interface VisitLike {
  passId: string | null;
  way: string;
  enteredAt: string;
  deletedAt?: string | null;
}

/** When the current membership year began: the last anniversary of
 * `renewsOn` on or before today, as 'YYYY-MM-DD'; null without a date. */
export function membershipYearStart(renewsOn: string | null, today: string): string | null {
  const match = renewsOn ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(renewsOn) : null;
  if (!match) return null;
  const monthDay = `${match[2]}-${match[3]}`;
  const year = Number(today.slice(0, 4));
  const thisYear = `${year}-${monthDay}`;
  return thisYear <= today ? thisYear : `${year - 1}-${monthDay}`;
}

/** Free visits used this membership year: what was typed when the pass was
 * added (if that was this year) plus the pass visits logged since. */
export function visitsUsed(pass: PassLike, visits: VisitLike[], today: string): number {
  const start = membershipYearStart(pass.renewsOn, today);
  const typedThisYear = !start || pass.createdAt.slice(0, 10) >= start;
  const logged = visits.filter(
    (v) => v.passId === pass.id && v.way === 'pass' && !v.deletedAt && (!start || v.enteredAt.slice(0, 10) >= start),
  ).length;
  return (typedThisYear ? pass.usedBefore : 0) + logged;
}

/** Free visits left, or null for an unlimited pass. Never below zero. */
export function visitsLeft(pass: PassLike, visits: VisitLike[], today: string): number | null {
  if (pass.freeVisits == null) return null;
  return Math.max(0, pass.freeVisits - visitsUsed(pass, visits, today));
}

/** "Running low" from this many free visits left. */
export const RUNNING_LOW = 2;

export function runningLow(left: number | null): boolean {
  return left != null && left <= RUNNING_LOW;
}

function money(cents: number | null, currency: string | null): Money | null {
  return cents != null && currency ? { amount: cents, currency } : null;
}

/** The pass as the engine wants it. */
export function enginePass(pass: PassLike, visits: VisitLike[], today: string): LoungePass | null {
  const network = networkInfo(pass.network)?.id;
  if (!network) return null;
  return {
    id: pass.id,
    network,
    visitsLeft: visitsLeft(pass, visits, today),
    extraVisit: money(pass.extraVisitCents, pass.currency),
  };
}

/** "5 free visits left", "1 free visit left", "Unlimited visits". */
export function visitsLeftLabel(left: number | null): string {
  if (left == null) return 'Unlimited visits';
  return `${left} free ${left === 1 ? 'visit' : 'visits'} left`;
}
