import { useLocalSearchParams } from 'expo-router';

import { FollowTrip } from '@/screens/follow-trip';

/** A followed person's live trip, pushed inside the People tab so the tab
 * bar stays put (the root-level /t/<token> is for links from outside). */
export default function PeopleTripRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <FollowTrip token={typeof token === 'string' ? token : ''} />;
}
