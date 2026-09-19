/** Trip updates — what a traveller shares from inside a trip, as the app
 * reads and writes them. The rules (window, text length, where a post was
 * made from) live in convex/updatesShared.ts so the composer is only ever
 * offered when the server would accept the post. */

import { STAGE_LABELS, type TravelStage } from '@/services/travel-day';
import { cityOf } from '@/services/timeline';
import { formatDayLabel, formatTime } from '@/services/dates';

import type { LikerRelation } from '../../convex/updatesShared';

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

/** One person behind a heart on the owner's update (convex/updates.ts
 * `mine`). `at` is null for hearts given before the time was kept. */
export interface Liker {
  userId: string;
  name: string;
  imageUrl: string | null;
  relation: LikerRelation;
  at: string | null;
}

/** The owner's copy carries the people behind the hearts: `reactedBy` is
 * names only; `likers` (faces, relation, time) is absent from a server that
 * predates the "Liked by" list. */
export interface OwnUpdate extends TripUpdate {
  reactedBy: string[];
  likers?: Liker[];
}

/** "Liked by Clara, Noah and 3 others" as runs of text, the names (and the
 * "N others") bold: first names only, at most two named. */
export function likedByParts(names: string[]): { text: string; bold: boolean }[] {
  const first = names.map((n) => n.trim().split(/\s+/)[0] || n);
  if (!first.length) return [];
  const parts: { text: string; bold: boolean }[] = [{ text: 'Liked by ', bold: false }];
  if (first.length === 1) return [...parts, { text: first[0]!, bold: true }];
  if (first.length === 2) {
    return [...parts, { text: first[0]!, bold: true }, { text: ' and ', bold: false }, { text: first[1]!, bold: true }];
  }
  const rest = first.length - 2;
  return [
    ...parts,
    { text: first[0]!, bold: true },
    { text: ', ', bold: false },
    { text: first[1]!, bold: true },
    { text: ' and ', bold: false },
    { text: `${rest} other${rest === 1 ? '' : 's'}`, bold: true },
  ];
}

/** The line under a liker's name: how they know the traveller. */
export function relationLabel(relation: LikerRelation): string | null {
  switch (relation) {
    case 'close':
      return 'Close circle';
    case 'mutual':
      return 'You follow each other';
    case 'follower':
      return 'Follows you';
    default:
      return null;
  }
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
