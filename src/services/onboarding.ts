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
