/** Asks for a store rating at the moment review-moment.ts picks, through
 * the OS's own sheet (SKStoreReviewController / Play in-app review) — never
 * from a button, never with a question of ours in front of it. The OS may
 * still decide not to show it; we count the ask either way, so a refusal
 * isn't retried on every launch. */

import * as Application from 'expo-application';
import Storage from 'expo-sqlite/kv-store';
import * as StoreReview from 'expo-store-review';

import { shouldAskForReview, type ReviewHistory, type ReviewJourney } from '@/services/review-moment';

const KEY = 'review-prompt';

function readHistory(now: number): ReviewHistory {
  try {
    const stored = JSON.parse(Storage.getItemSync(KEY) ?? 'null') as ReviewHistory | null;
    if (stored && typeof stored.firstSeenAt === 'number') return stored;
  } catch {
    // Corrupt or missing: start the clock now.
  }
  const fresh: ReviewHistory = { firstSeenAt: now, lastAskedAt: null, lastAskedVersion: null };
  Storage.setItemSync(KEY, JSON.stringify(fresh));
  return fresh;
}

/** Once per launch at most, whatever the outcome. */
let checked = false;

export async function maybeAskForReview(rows: readonly ReviewJourney[]): Promise<void> {
  if (checked) return;
  checked = true;
  const now = Date.now();
  const version = Application.nativeApplicationVersion ?? '0';
  const history = readHistory(now);
  if (!shouldAskForReview(rows, history, version, now)) return;
  try {
    // False on TestFlight installs, where the sheet never shows.
    if (!(await StoreReview.isAvailableAsync())) return;
    Storage.setItemSync(KEY, JSON.stringify({ ...history, lastAskedAt: now, lastAskedVersion: version }));
    await StoreReview.requestReview();
  } catch (error) {
    console.warn('[review-prompt] request failed', error);
  }
}
