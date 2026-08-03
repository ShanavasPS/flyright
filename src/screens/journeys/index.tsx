import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';

export function Journeys() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Journeys</ThemedText>
        <ThemedText>
          Add a flight or train and we&apos;ll watch it. The moment a delay makes you
          eligible for compensation, you&apos;ll know — and how much.
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="subtitle">No journeys yet</ThemedText>
          <ThemedText type="small">
            Scan a boarding pass or enter a flight/train number to start.
          </ThemedText>
          {/* Demo journey until ingestion lands — exercises the whole verdict flow. */}
          <Link href="/journey/demo">
            <ThemedText type="link">See a demo verdict →</ThemedText>
          </Link>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
});
