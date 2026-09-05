import { useUser } from '@clerk/expo';
import { useConvexAuth, useMutation } from 'convex/react';
import { useEffect } from 'react';

import { api } from '../../convex/_generated/api';

/** Mirrors the Clerk display name/photo into Convex `profiles` — the
 * webhook does this too; this is the belt to its braces (see
 * users.syncMyProfile). Renders nothing; mounted inside CloudSync. */
export function ProfileSync() {
  const { user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const sync = useMutation(api.users.syncMyProfile);
  const name = user?.firstName?.trim() || user?.username?.trim() || '';
  const imageUrl = user?.hasImage ? user.imageUrl : null;
  // The address is how someone finds them in "add someone" (circle.findPeople).
  // It is stored lowercased, never returned to another user, and this call is
  // what backfills accounts that synced before search existed.
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  useEffect(() => {
    if (!isAuthenticated || !name) return;
    sync({ name, imageUrl, email }).catch(() => {});
  }, [isAuthenticated, name, imageUrl, email, sync]);

  return null;
}
