import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { evaluate } from '@/rules/engine';
import type { Disruption, Journey } from '@/rules/types';
import { hasPro } from '@/services/purchases';
import { Pressable } from 'react-native';

// Hardcoded until ingestion + SQLite queries land; exercises the full verdict flow.
const DEMO_JOURNEY: Journey = {
  id: 'demo',
  mode: 'flight',
  carrier: 'Lufthansa',
  carrierCountry: 'DE',
  number: 'LH873',
  from: { code: 'HEL', country: 'FI' },
  to: { code: 'FRA', country: 'DE' },
  distanceKm: 1530,
  scheduledDeparture: '2026-08-10T08:00:00Z',
  scheduledArrival: '2026-08-10T10:30:00Z',
};

const DEMO_DISRUPTION: Disruption = { type: 'delay', delayMinutes: 195 };

export function JourneyDetail({ journeyId }: { journeyId: string | undefined }) {
  const router = useRouter();
  const journey = DEMO_JOURNEY; // TODO: load by journeyId from db
  const verdict = evaluate(journey, DEMO_DISRUPTION);

  const startClaim = async () => {
    if (await hasPro()) {
      // TODO: claim wizard route
      return;
    }
    router.push('/paywall');
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">
          {journey.carrier} {journey.number}
        </ThemedText>
        <ThemedText>
          {journey.from.code} → {journey.to.code}
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          {verdict.eligible && verdict.compensation ? (
            <>
              <ThemedText type="title">
                You&apos;re owed {verdict.compensation.amount} {verdict.compensation.currency}
              </ThemedText>
              <ThemedText type="small">{verdict.reason}</ThemedText>
              <ThemedText type="small">Regulation: {verdict.regulation}</ThemedText>
              <Pressable onPress={startClaim} style={styles.cta}>
                <ThemedText type="subtitle">Generate my claim →</ThemedText>
              </Pressable>
            </>
          ) : (
            <>
              <ThemedText type="subtitle">No compensation due</ThemedText>
              <ThemedText type="small">{verdict.reason}</ThemedText>
            </>
          )}
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
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  cta: {
    marginTop: Spacing.two,
  },
});
