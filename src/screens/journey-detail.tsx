import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { evaluate } from '@/rules/engine';
import type { Disruption, Journey } from '@/rules/types';
import { formatDayLabelWithYear } from '@/services/dates';
import { lookupFlight } from '@/services/flight-lookup';
import { deleteJourney, toDomainJourney, useJourney } from '@/services/journeys';
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

// Past this age, EU261/UK261 claim windows (2–6 years depending on country)
// have usually lapsed — the trip is journal material, not a claim.
const CLAIM_WINDOW_MS = 3 * 365 * 86_400_000;

export function JourneyDetail({ journeyId }: { journeyId: string | undefined }) {
  // Frozen at mount — claim-window age doesn't need to tick while open.
  const [now] = useState(() => Date.now());
  const isDemo = !journeyId || journeyId === 'demo';
  const row = useJourney(journeyId ?? 'demo');
  const journey = isDemo ? DEMO_JOURNEY : row ? toDomainJourney(row) : null;

  // Only 'lookup' rows track a live flight; manual journal entries and the
  // demo must never hit the status API.
  const isLookupable = !isDemo && !!journey && row?.source === 'lookup' && !!journey.number;

  // Live disruption data for tracked journeys; the demo uses a canned 195-min delay.
  const status = useQuery({
    queryKey: ['flight-status', journey?.number, journey?.scheduledDeparture.slice(0, 10)],
    queryFn: () => lookupFlight(journey!.number, journey!.scheduledDeparture.slice(0, 10)),
    enabled: isLookupable,
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

  const tripAge = now - Date.parse(journey.scheduledDeparture);
  // A verdict is a bonus on top of the journal — when we can't get live data
  // (manual entries, flights the provider no longer remembers), the trip
  // simply reads as history instead of showing a spinner or an error.
  const journalOnly = !isDemo && (!isLookupable || status.isError);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" themeColor="heading">
          {journey.number ? `${journey.carrier} ${journey.number}` : journey.carrier}
        </ThemedText>
        <ThemedText>
          {journey.from.code} → {journey.to.code}
        </ThemedText>

        {disruption ? (
          <VerdictCard journey={journey} disruption={disruption} />
        ) : journalOnly ? (
          <Card>
            <ThemedText type="subtitle">
              {formatDayLabelWithYear(journey.scheduledDeparture)}
            </ThemedText>
            <ThemedText type="small">
              You flew {Math.round(journey.distanceKm).toLocaleString()} km
              {journey.from.country && journey.to.country
                ? journey.from.country === journey.to.country
                  ? ` within ${journey.from.country}`
                  : ` from ${journey.from.country} to ${journey.to.country}`
                : ''}
              .
            </ThemedText>
            {tripAge > CLAIM_WINDOW_MS && (
              <ThemedText type="small" themeColor="textSecondary">
                Compensation claim windows (2–6 years depending on country) have likely
                passed for this trip.
              </ThemedText>
            )}
          </Card>
        ) : (
          <Card>
            <ThemedText type="subtitle">We&apos;re watching this flight</ThemedText>
            <ThemedText type="small">
              {status.isPending && !isDemo
                ? 'Checking the latest status…'
                : "No disruption so far. If a delay makes you eligible for compensation, you'll know here first."}
            </ThemedText>
          </Card>
        )}

        {!isDemo && row && <RemoveRow journeyId={row.id} />}
      </SafeAreaView>
    </ThemedView>
  );
}

function RemoveRow({ journeyId }: { journeyId: string }) {
  const router = useRouter();
  const theme = useTheme();

  const confirmRemove = () => {
    Alert.alert('Remove this trip?', 'It will disappear from your travel history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteJourney(journeyId);
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={styles.removeRow}>
      <Pressable onPress={confirmRemove} hitSlop={Spacing.two}>
        <ThemedText type="small" style={{ color: theme.danger }}>
          Remove from My travels
        </ThemedText>
      </Pressable>
    </View>
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
    <Card>
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
    </Card>
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
  removeRow: {
    marginTop: 'auto',
    paddingBottom: Spacing.four,
    alignItems: 'center',
  },
  cta: {
    marginTop: Spacing.two,
  },
});
