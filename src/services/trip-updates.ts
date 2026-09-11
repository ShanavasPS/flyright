/** Trip updates — what a traveller shares from inside a trip, as the app
 * reads and writes them. The rules (window, text length, where a post was
 * made from) live in convex/updatesShared.ts so the composer is only ever
 * offered when the server would accept the post. */

import { STAGE_LABELS, type TravelStage } from '@/services/travel-day';
import { cityOf } from '@/services/timeline';
import { formatDayLabel, formatTime } from '@/services/dates';

export { UPDATE_TEXT_MAX, updateWindow, updateWindowOpen } from '../../convex/updatesShared';

/** One update as every follower surface receives it (convex/updates.ts). */
export interface TripUpdate {
  updateId: string;
  text: string;
  photoUrl: string | null;
  width: number | null;
  height: number | null;
  stage: string | null;
  place: string | null;
  createdAt: string;
  reactions: number;
  reacted: boolean;
}

/** The owner's copy carries the names behind the hearts. */
export interface OwnUpdate extends TripUpdate {
  reactedBy: string[];
}

/** "On board · Helsinki", "In the air", "Landed · Doha", "Doha": where the
 * traveller was when they posted, in the words the travel day uses for it.
 * Every pre-departure stage names the origin; the flight itself names no
 * place; the other end is the destination. */
export function updateContext(update: Pick<TripUpdate, 'stage' | 'place'>): string | null {
  const city = update.place ? cityOf(update.place) : null;
  const stage = update.stage as TravelStage | null;
  if (stage === 'departed') return 'In the air';
  if (stage === 'boarded') return 'On board';
  if (stage === 'landed') return city ? `Landed · ${city}` : 'Landed';
  const label = stage && STAGE_LABELS[stage] ? STAGE_LABELS[stage] : null;
  if (label && city) return `${label} · ${city}`;
  return label ?? city;
}

/** "just now", "12m ago", "3h ago", then the day — a caption's age, short
 * enough to sit on one line beside the words. */
export function agoLabel(iso: string, now: Date): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const ms = now.getTime() - at;
  if (ms < 90_000) return 'just now';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  return `${formatDayLabel(iso)} ${formatTime(iso)}`;
}

/** The caption, or what to say for a photo posted without one. */
export function captionOf(update: Pick<TripUpdate, 'text' | 'photoUrl'>): string {
  return update.text || (update.photoUrl ? 'Shared a photo' : '');
}

/** The frame a photo is shown in, as width ÷ height. Landscape shots keep
 * their own shape; a portrait one is cropped to a wide frame rather than
 * taking the whole screen — this is a line from the trip, not a gallery.
 * The photo viewer isn't involved: followers read, they don't browse. */
export const MIN_PHOTO_ASPECT = 1.25;

export function photoAspect(update: Pick<TripUpdate, 'width' | 'height'>): number {
  if (!update.width || !update.height) return 1.5;
  return Math.max(MIN_PHOTO_ASPECT, update.width / update.height);
}
