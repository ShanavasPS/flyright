import { useLocalSearchParams } from 'expo-router';

import { FollowerTrip } from '@/screens/follower-trip';

/** One trip of theirs, read-only. Nested under the person so back goes to
 * the profile and back again to People — the way a push that opens straight
 * on a trip has to unwind. */
export default function PersonTripRoute() {
  const { id, journeyId } = useLocalSearchParams<{ id: string; journeyId: string }>();
  return (
    <FollowerTrip
      ownerId={typeof id === 'string' ? id : ''}
      journeyId={typeof journeyId === 'string' ? journeyId : ''}
    />
  );
}
