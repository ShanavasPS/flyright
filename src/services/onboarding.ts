import Storage from 'expo-sqlite/kv-store';

const SEEN_KEY = 'onboarding-seen';

/** Whether the first-run intro has been shown — or waived for a user whose
 * journal already had entries when the intro shipped. */
export function onboardingSeen(): boolean {
  return Storage.getItemSync(SEEN_KEY) != null;
}

export function markOnboardingSeen(): void {
  Storage.setItemSync(SEEN_KEY, new Date().toISOString());
}

const PUSH_REMIND_KEY = 'push-remind-later';
/** "Later" means a genuinely later session, not the next foreground — a day
 * keeps the follow-up from reading as a nag after a quick relaunch. */
const PUSH_REMIND_AFTER_MS = 24 * 3_600_000;

/** The user tapped "Remind me later" on onboarding's push pitch. */
export function markPushRemindLater(): void {
  Storage.setItemSync(PUSH_REMIND_KEY, new Date().toISOString());
}

/** Whether the promised reminder has come due. The caller consumes the flag
 * with clearPushRemind() so the follow-up shows at most once. */
export function pushRemindDue(): boolean {
  const at = Storage.getItemSync(PUSH_REMIND_KEY);
  return at != null && Date.now() - Date.parse(at) >= PUSH_REMIND_AFTER_MS;
}

export function clearPushRemind(): void {
  Storage.removeItemSync(PUSH_REMIND_KEY);
}
