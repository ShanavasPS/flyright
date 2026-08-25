import { useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CONVEX_URL } from '@/constants/config';
import { FollowTrip } from '@/screens/follow-trip';

/** getflyright.com/t/<token> — the shareable live-trip page. Universal: the
 * web funnel serves it to anyone; universal links open it in the app, where
 * it lands as a root-stack push (same pattern as /check and /welcome). */
export default function FollowTripRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  // Convex hooks need the provider; a build without a deployment (dev with
  // an empty env) can't show live trips at all.
  if (!CONVEX_URL) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ThemedText themeColor="textSecondary">Live trips aren&apos;t available.</ThemedText>
      </ThemedView>
    );
  }
  return <FollowTrip token={typeof token === 'string' ? token : ''} />;
}
