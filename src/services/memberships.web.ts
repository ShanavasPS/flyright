// Web build: no SQLite — memberships live on the phone only, so the web
// shows none. Same API surface, like trip-documents.web.ts.

import type { memberships } from '@/db/schema';

export type MembershipRow = typeof memberships.$inferSelect;
export type MembershipInput = Omit<MembershipRow, 'id' | 'userId' | 'position' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export function useMemberships(_userId: string | null | undefined): MembershipRow[] | undefined {
  return [];
}

export function useMembership(_id: string | undefined): MembershipRow | undefined {
  return undefined;
}

export async function addMembership(): Promise<string> {
  throw new Error('Memberships are kept on your phone.');
}

export async function updateMembership(): Promise<void> {}

export async function deleteMembership(): Promise<void> {}

export function getMembershipLock(): boolean {
  return true;
}

export function setMembershipLock(_on: boolean) {}

export async function unlockLabel(): Promise<string> {
  return 'passcode';
}

export async function unlockMemberships(): Promise<boolean> {
  return false;
}
