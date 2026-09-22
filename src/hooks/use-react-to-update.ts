import { useMutation } from 'convex/react';
import type { FunctionReference } from 'convex/server';

import { api } from '@/../convex/_generated/api';
import { flipHeart } from '@/services/update-heart';

/** Every query that shows a heart on someone's update. */
const SHOWS_HEARTS = [
  api.updates.feed,
  api.updates.forTrip,
  api.circle.person,
  api.circle.trip,
  api.circle.list,
  api.live.byToken,
  api.live.byFollow,
  api.live.following,
] as FunctionReference<'query'>[];

/**
 * The follower's heart, flipped on screen the moment it is tapped: every
 * loaded query holding the update shows the new state and count at once,
 * and the server's answer replaces it when it lands (or rolls it back if
 * the mutation fails). Waiting for the round trip made the heart feel dead.
 */
export function useReactToUpdate() {
  return useMutation(api.updates.react).withOptimisticUpdate((store, { updateId }) => {
    for (const query of SHOWS_HEARTS) {
      for (const { args, value } of store.getAllQueries(query)) {
        if (value === undefined) continue;
        const next = flipHeart(value, updateId);
        if (next !== value) store.setQuery(query, args, next);
      }
    }
  });
}
