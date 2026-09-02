import { useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CONVEX_URL } from '@/constants/config';
import { JoinCircle } from '@/screens/join-circle';

/** getflyright.com/i/<token> — a personal "follow my trips" invite.
 * Universal like /t/<token>: the web funnel serves it to anyone (store
 * links), universal links open it in the app as a root-stack push. */
export default function JoinCircleRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  if (!CONVEX_URL) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ThemedText themeColor="textSecondary">Sharing isn&apos;t available.</ThemedText>
      </ThemedView>
    );
  }
  return <JoinCircle token={typeof token === 'string' ? token : ''} />;
}
