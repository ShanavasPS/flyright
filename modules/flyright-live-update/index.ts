/** JS boundary for the Android travel-day Live Update — the sibling of
 * src/services/live-activity.ts on iOS. The native module exists only in
 * Android binaries; everywhere else `requireOptionalNativeModule` yields null
 * and every call is a no-op, so callers don't need platform guards.
 *
 * The field names are the contract with LiveUpdateContent in
 * android/src/main/java/expo/modules/flyrightliveupdate/FlyRightLiveUpdateModule.kt
 * — change them together. */

import { requireOptionalNativeModule } from 'expo';

export interface LiveUpdateContent {
  title: string;
  /** "Flight in 3h" / "Lands in 40 min" / "Landed" — leads the content line. */
  headline: string;
  subtitle: string;
  fromCode: string;
  toCode: string;
  flightLabel: string;
  /** Flight progress 0..1: zero until departure, then time-based, 1 landed. */
  progress: number;
  /** One-or-two-word status for the Android 16 status-bar chip. */
  compactLabel: string;
  /** Instant (ms since epoch, 0 = none) the countdown runs to — the
   * (estimated) departure, then the arrival. On Android 16 the status-bar
   * chip counts down to it by itself ("2h 14m" style, no seconds) in place
   * of the compact word; a push only moves the anchor. */
  countdownEnd: number;
  gate: string | null;
  terminal: string | null;
  delayLabel: string | null;
  emphasis: 'none' | 'delay' | 'gate';
  /** The lead rule's two lines (src/services/live-update-copy.ts): "Departs
   * in · Gate 53" over "Boards 15:30". When set, they replace the route
   * title and the headline/next-step line. Optional: an older JS side
   * leaves them out and the card reads as before. */
  leadTitle?: string;
  leadText?: string;
  /** Colours the card: 'delay' amber, 'boarding' green, else the brand. */
  tone?: 'normal' | 'boarding' | 'delay' | 'landed';
}

/** A card for later: what the notification should read from `at` (ms since
 * epoch) on — the moment a countdown runs out, when "Departs in" has to
 * become "Lands in" whether or not the app is running. */
export interface ScheduledLiveUpdate {
  at: number;
  content: LiveUpdateContent;
}

const native = requireOptionalNativeModule<{
  post(journeyId: string, content: LiveUpdateContent, scheduled: ScheduledLiveUpdate[]): void;
  end(journeyId: string, content: LiveUpdateContent | null): void;
  canPostPromoted(): boolean;
}>('FlyRightLiveUpdate');

/** Post or replace-in-place the journey's ongoing Live Update, with the
 * cards the OS should swap in by itself when each countdown runs out
 * (inexact alarms; a card the traveller swiped away stays away). Every post
 * replaces the previous schedule. */
export function postTravelLiveUpdate(
  journeyId: string,
  content: LiveUpdateContent,
  scheduled: ScheduledLiveUpdate[] = [],
): void {
  native?.post(journeyId, content, scheduled);
}

/** End the surface — with content, a dismissible final card lingers (the
 * Android analogue of the iOS dimmed post-end state); without, it's removed. */
export function endTravelLiveUpdate(journeyId: string, content?: LiveUpdateContent): void {
  native?.end(journeyId, content ?? null);
}

/** Whether the OS grants Live Update promotion (Android 16+, user-revocable). */
export function canPostPromotedLiveUpdates(): boolean {
  return native?.canPostPromoted() ?? false;
}
