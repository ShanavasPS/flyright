import type { ReviewJourney } from '@/services/review-moment';

/** The website has no store to rate in. */
export async function maybeAskForReview(_rows: readonly ReviewJourney[]): Promise<void> {}
