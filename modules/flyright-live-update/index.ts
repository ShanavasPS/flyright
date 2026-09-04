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
  gate: string | null;
  terminal: string | null;
  delayLabel: string | null;
  emphasis: 'none' | 'delay' | 'gate';
}

const native = requireOptionalNativeModule<{
  post(journeyId: string, content: LiveUpdateContent): void;
  end(journeyId: string, content: LiveUpdateContent | null): void;
  canPostPromoted(): boolean;
}>('FlyRightLiveUpdate');

/** Post or replace-in-place the journey's ongoing Live Update. */
export function postTravelLiveUpdate(journeyId: string, content: LiveUpdateContent): void {
  native?.post(journeyId, content);
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
