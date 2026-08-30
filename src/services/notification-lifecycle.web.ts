// Web build: no local notifications, no OneSignal — the lifecycle is a no-op.
import type { Journey } from '@/rules/types';

export function setNotificationViewer(_userId: string | null) {}

export function initNotificationLifecycle() {}

export async function reconcileNotifications(): Promise<void> {}

export async function maybeNotifyDelay(_journey: Journey, _delayMinutes: number): Promise<void> {}

export async function maybeNotifyInbound(_journey: Journey, _outlook: unknown): Promise<void> {}
