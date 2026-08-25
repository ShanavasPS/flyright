// Web build — Live Activities are an iOS-only surface.

import type { LiveContent, TravelJourney } from '@/services/travel-day';

export function initLiveActivities(): void {}

export function getActivityId(_journeyId: string): string | null {
  return null;
}

export function startTravelActivity(_journey: TravelJourney, _content: LiveContent): void {}

export function updateTravelActivity(_journeyId: string, _content: LiveContent): void {}

export function endTravelActivity(_journeyId: string, _content?: LiveContent): void {}
