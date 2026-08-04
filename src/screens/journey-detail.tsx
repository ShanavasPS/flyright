import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { evaluate } from '@/rules/engine';
import type { Disruption, Journey } from '@/rules/types';
import { lookupFlight } from '@/services/flight-lookup';
import { toDomainJourney, useJourney } from '@/services/journeys';
import { hasPro } from '@/services/purchases';

// Kept as a data-free showcase of the verdict flow ("See a demo verdict" on the
// journeys list) and as the fallback while real rows load.
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
  const isDemo = !journeyId || journeyId === 'demo';
  const row = useJourney(journeyId ?? 'demo');
  const journey = isDemo ? DEMO_JOURNEY : row ? toDomainJourney(row) : null;

  // Live disruption data for real journeys; the demo uses a canned 195-min delay.
  const status = useQuery({
    queryKey: ['flight-status', journey?.number, journey?.scheduledDeparture.slice(0, 10)],
    queryFn: () => lookupFlight(journey!.number, journey!.scheduledDeparture.slice(0, 10)),
    enabled: !isDemo && !!journey,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!journey) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const delayMinutes = isDemo ? DEMO_DISRUPTION.delayMinutes : status.data?.delayMinutes;
  const disruption: Disruption | null =
    delayMinutes != null ? { type: 'delay', delayMinutes } : null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" themeColor="heading">
          {journey.carrier} {journey.number}
        </ThemedText>
        <ThemedText>
          {journey.from.code} → {journey.to.code}
        </ThemedText>

        {disruption ? (
          <VerdictCard journey={journey} disruption={disruption} />
        ) : (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle">We&apos;re watching this flight</ThemedText>
            <ThemedText type="small">
              {status.isPending && !isDemo
                ? 'Checking the latest status…'
                : "No disruption so far. If a delay makes you eligible for compensation, you'll know here first."}
            </ThemedText>
          </ThemedView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function VerdictCard({ journey, disruption }: { journey: Journey; disruption: Disruption }) {
  const router = useRouter();
  const theme = useTheme();
  const verdict = evaluate(journey, disruption);

  const startClaim = async () => {
    if (await hasPro()) {
      // TODO: claim wizard route
      return;
    }
    router.push('/paywall');
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {verdict.eligible && verdict.compensation ? (
        <>
          <ThemedText type="title" style={{ color: theme.success }}>
            You&apos;re owed {verdict.compensation.amount} {verdict.compensation.currency}
          </ThemedText>
          <ThemedText type="small">{verdict.reason}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Regulation: {verdict.regulation}
          </ThemedText>
          <View style={styles.cta}>
            <PrimaryButton label="Generate my claim →" onPress={startClaim} />
          </View>
        </>
      ) : (
        <>
          <ThemedText type="subtitle">No compensation due</ThemedText>
          <ThemedText type="small">{verdict.reason}</ThemedText>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
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
