// The web invite page never signs anyone in — it sells the app. Nothing to
// remember, so the native module's storage stays out of the web bundle.
export function markPendingFollow(_token: string): void {}

export function pendingFollowFor(_token: string): boolean {
  return false;
}

export function clearPendingFollow(): void {}
