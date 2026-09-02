/**
 * Web build: Layers stays native-only, so the funnel pages ship no analytics
 * SDK (and no new consent surface). Same exports as analytics.ts, every one a
 * no-op — purchases.ts and the screens call these without platform checks.
 * tsc typechecks against analytics.ts (no moduleSuffixes), so signatures only
 * need to be call-compatible here.
 */

export function initAnalytics(): Promise<void> {
  return Promise.resolve();
}

export function trackEvent(_name: string, _properties?: Record<string, unknown>): void {}

export function logInAnalytics(_userId: string, _traits?: Record<string, unknown>): void {}

export function logOutAnalytics(): void {}

export function trackAuth(_kind: 'sign_up' | 'login', _method: string): void {}

export function setAnalyticsUserProperties(_properties: Record<string, unknown>): void {}

export function trackPurchaseCompleted(_record: unknown): void {}

export async function connectPurchasesAnalytics(_purchases: unknown): Promise<void> {}

export async function requestTrackingConsent(_delayMs = 0): Promise<void> {}

export function useAnalyticsScreenTracking(): void {}
