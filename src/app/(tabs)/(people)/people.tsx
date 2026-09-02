import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CONVEX_URL } from '@/constants/config';
import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { People } from '@/screens/people';

export default function PeopleRoute() {
  useMarkInteractive();
  // Convex hooks need the provider; a build without a deployment (dev with
  // an empty env) has no circles at all.
  if (!CONVEX_URL) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ThemedText themeColor="textSecondary">Sharing isn&apos;t available.</ThemedText>
      </ThemedView>
    );
  }
  return <People />;
}
