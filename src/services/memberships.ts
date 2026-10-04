/** The traveller's frequent flyer memberships: the local `memberships`
 * table (docs/memberships.md). Device-only — never synced, so a membership
 * number never leaves the phone. Rows belong to the account that added them
 * (null while anonymous), like journeys. */

import { and, asc, eq, isNull, or } from 'drizzle-orm';
import * as LocalAuthentication from 'expo-local-authentication';
import Storage from 'expo-sqlite/kv-store';

import { db } from '@/db/client';
import { memberships } from '@/db/schema';
import { useLiveRows } from '@/services/live-rows';

export type MembershipRow = typeof memberships.$inferSelect;

export type MembershipInput = Pick<
  MembershipRow,
  | 'programme'
  | 'customAirline'
  | 'customProgramme'
  | 'number'
  | 'tier'
  | 'balance'
  | 'qualifying'
  | 'qualifyingTarget'
  | 'tierUntil'
  | 'expiringAmount'
  | 'expiringOn'
>;

function ownedBy(userId: string | null | undefined) {
  return userId ? or(isNull(memberships.userId), eq(memberships.userId, userId)) : isNull(memberships.userId);
}

/** The stack, in card order. Live; undefined until the first read. */
export function useMemberships(userId: string | null | undefined): MembershipRow[] | undefined {
  const { data } = useLiveRows(
    db
      .select()
      .from(memberships)
      .where(and(ownedBy(userId), isNull(memberships.deletedAt)))
      .orderBy(asc(memberships.position), asc(memberships.createdAt)),
    [userId ?? null],
  );
  return data;
}

export function useMembership(id: string | undefined): MembershipRow | undefined {
  const { data } = useLiveRows(
    db
      .select()
      .from(memberships)
      .where(and(eq(memberships.id, id ?? ''), isNull(memberships.deletedAt))),
    [id ?? ''],
  );
  return data?.[0];
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Adds a card at the bottom of the stack; resolves to its id. */
export async function addMembership(userId: string | null | undefined, input: MembershipInput): Promise<string> {
  const existing = await db
    .select({ position: memberships.position })
    .from(memberships)
    .where(and(ownedBy(userId), isNull(memberships.deletedAt)));
  const position = existing.reduce((max, r) => Math.max(max, r.position + 1), 0);
  const now = new Date().toISOString();
  const id = newId();
  await db.insert(memberships).values({
    id,
    userId: userId ?? null,
    ...input,
    position,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  return id;
}

export async function updateMembership(id: string, input: MembershipInput): Promise<void> {
  await db
    .update(memberships)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(eq(memberships.id, id));
}

export async function deleteMembership(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.update(memberships).set({ deletedAt: now, updatedAt: now }).where(eq(memberships.id, id));
}

const LOCK_KEY = 'memberships-biometric-lock';

/** Settings → "Face ID for memberships": numbers stay hidden until the
 * traveller passes the phone's own lock. On by default. */
export function getMembershipLock(): boolean {
  return Storage.getItemSync(LOCK_KEY) !== 'off';
}

export function setMembershipLock(on: boolean) {
  Storage.setItemSync(LOCK_KEY, on ? 'on' : 'off');
}

/** What the phone calls its lock, for the button and the setting:
 * "Face ID", "Touch ID", "fingerprint" or "passcode". */
export async function unlockLabel(): Promise<string> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) return 'passcode';
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return process.env.EXPO_OS === 'ios' ? 'Face ID' : 'face unlock';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return process.env.EXPO_OS === 'ios' ? 'Touch ID' : 'fingerprint';
    }
  } catch {
    // Fall through: the device lock is still asked for.
  }
  return 'passcode';
}

/** Asks for the phone's lock before a number is shown. True when the lock
 * is off in Settings, when it passes, or when the phone has no lock at all
 * (nothing to ask — the number is the traveller's own). */
export async function unlockMemberships(): Promise<boolean> {
  if (!getMembershipLock()) return true;
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) return true;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Show membership number',
      cancelLabel: 'Cancel',
    });
    return result.success;
  } catch {
    return false;
  }
}
