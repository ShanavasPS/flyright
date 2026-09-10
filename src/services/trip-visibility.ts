import { watcherNames } from '@/services/circle';

/** Who a trip is shown to. 'circle' = everyone following the traveler,
 * 'close' = only the members they marked as close circle, 'private' = nobody
 * but the traveler: no People row, no push, no follow, no live link. Stored
 * as two flags on the row (see flagsFor) so clients that predate 'private'
 * still read the close-circle flag they know. */
export type TripVisibility = 'circle' | 'close' | 'private';

export const VISIBILITY_ORDER: TripVisibility[] = ['circle', 'close', 'private'];

export const VISIBILITY_LABEL: Record<TripVisibility, string> = {
  circle: 'Whole circle',
  close: 'Close circle',
  private: 'Only me',
};

/** The row flags for a visibility; the inverse of visibilityOf. */
export function flagsFor(visibility: TripVisibility) {
  return {
    hiddenFromCircle: visibility !== 'circle',
    privateTrip: visibility === 'private',
  };
}

export function visibilityOf(row: { hiddenFromCircle?: boolean; privateTrip?: boolean }): TripVisibility {
  if (row.privateTrip) return 'private';
  return row.hiddenFromCircle ? 'close' : 'circle';
}

/** The trip-card chip for a visibility; nothing for the default. */
export function visibilityChip(visibility: TripVisibility): string | null {
  if (visibility === 'close') return 'Close circle only';
  if (visibility === 'private') return 'Only you';
  return null;
}

/** One line saying who will see a trip, for the add-trip screens and the
 * chooser: the followers in the level's tier by first name (watcherNames),
 * or why nobody yet. */
export function audienceLine(
  visibility: TripVisibility,
  followers: { name: string | null; close: boolean }[],
) {
  if (visibility === 'private') return 'Nobody else. No pushes, no follows, no live link.';
  const people = visibility === 'close' ? followers.filter((f) => f.close) : followers;
  if (!people.length) {
    return visibility === 'close'
      ? 'Nobody is in your close circle yet.'
      : 'Nobody follows you yet — people who join later will see it.';
  }
  return `${watcherNames(people)} will see it and get a heads-up.`;
}
