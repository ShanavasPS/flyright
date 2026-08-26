// Web is the informational surface — no first-run intro, nothing to store.
export function onboardingSeen(): boolean {
  return true;
}

export function markOnboardingSeen(): void {}

export function markPushRemindLater(): void {}

export function pushRemindDue(): boolean {
  return false;
}

export function clearPushRemind(): void {}
