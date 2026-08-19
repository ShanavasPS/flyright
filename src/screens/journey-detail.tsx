import { useAuth } from '@clerk/expo';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DEMO_DISRUPTION, DEMO_JOURNEY, isDemoJourneyId } from '@/constants/demo-journey';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { evaluate } from '@/rules/engine';
import type { Disruption, Journey } from '@/rules/types';
import { countryName, getAirport } from '@/services/airports';
import { useClaimForJourney } from '@/services/claims';
import { formatDayLabelWithYear, formatTime } from '@/services/dates';
import { recordDelay } from '@/services/disruptions';
import { lookupFlight } from '@/services/flight-lookup';
import { deleteJourney, toDomainJourney, useJourney } from '@/services/journeys';
import { hasPro } from '@/services/purchases';

// Past this age, EU261/UK261 claim windows (2–6 years depending on country)
// have usually lapsed — the trip is journal material, not a claim.
const CLAIM_WINDOW_MS = 3 * 365 * 86_400_000;

/** "Doha, Qatar" for a known airport; the country name alone otherwise. */
function placeLabel(place: Journey['from']): string {
  const airport = getAirport(place.code);
  if (airport) return `${airport.city}, ${countryName(airport.country)}`;
  return place.country ? countryName(place.country) : place.code;
}

/** "from Kochi, India to Doha, Qatar" — cities only when the leg stays within
 * one country, country names alone when the airports aren't in the dataset. */
function routeSentence(journey: Journey): string {
  const from = getAirport(journey.from.code);
  const to = getAirport(journey.to.code);
  if (from && to) {
    return from.country === to.country
      ? `from ${from.city} to ${to.city}`
      : `from ${from.city}, ${countryName(from.country)} to ${to.city}, ${countryName(to.country)}`;
  }
  if (journey.from.country && journey.to.country) {
    return journey.from.country === journey.to.country
      ? `within ${countryName(journey.from.country)}`
      : `from ${countryName(journey.from.country)} to ${countryName(journey.to.country)}`;
  }
  return '';
}

export function JourneyDetail({ journeyId }: { journeyId: string | undefined }) {
  // Frozen at mount — claim-window age doesn't need to tick while open.
  const [now] = useState(() => Date.now());
  const { userId } = useAuth();
  const isDemo = isDemoJourneyId(journeyId);
  const row = useJourney(journeyId ?? 'demo', userId);
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

  // Cache any observed delay so the journeys list can badge this row as owed
  // without its own status call (see services/disruptions.ts).
  const rowId = row?.id;
  const observedDelay = status.data?.delayMinutes;
  useEffect(() => {
    if (isDemo || !rowId || observedDelay == null) return;
    recordDelay(rowId, observedDelay).catch(() => {});
  }, [isDemo, rowId, observedDelay]);

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

  // Journal entries without user-entered times store the placeholder noon
  // pair — no schedule worth showing. A lone entered time reads as a departure.
  const schedule =
    journey.scheduledDeparture === journey.scheduledArrival
      ? journey.scheduledDeparture.endsWith('T12:00:00')
        ? null
        : `${tripAge > 0 ? 'Departed' : 'Departs'} ${formatTime(journey.scheduledDeparture)}`
      : `${formatTime(journey.scheduledDeparture)} → ${formatTime(journey.scheduledArrival)}`;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" themeColor="heading">
          {journey.number ? `${journey.carrier} ${journey.number}` : journey.carrier}
        </ThemedText>
        <View style={styles.routeBlock}>
          <ThemedText>
            {journey.from.code} → {journey.to.code}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {placeLabel(journey.from)} → {placeLabel(journey.to)}
          </ThemedText>
          {schedule && (
            <ThemedText type="small" themeColor="textSecondary">
              {schedule}
            </ThemedText>
          )}
        </View>

        {disruption ? (
          <VerdictCard journey={journey} disruption={disruption} />
        ) : journalOnly ? (
          <Card>
            <ThemedText type="subtitle">
              {formatDayLabelWithYear(journey.scheduledDeparture)}
            </ThemedText>
            <ThemedText type="small">
              You flew {Math.round(journey.distanceKm).toLocaleString()} km
              {routeSentence(journey) ? ` ${routeSentence(journey)}` : ''}.
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
  // Never set for the demo journey — there's no DB row to claim against.
  const claim = useClaimForJourney(journey.id);
  const claimSent = !!claim && claim.status !== 'draft';

  const startClaim = async () => {
    if (await hasPro()) {
      router.push({
        pathname: '/claim',
        params: { journeyId: journey.id, delay: String(disruption.delayMinutes ?? 0) },
      });
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
          {claimSent ? (
            <ThemedText type="small" themeColor="textSecondary">
              Claim sent{claim.sentAt ? ` on ${formatDayLabelWithYear(claim.sentAt)}` : ''} —
              response due by{' '}
              {claim.responseDeadline
                ? formatDayLabelWithYear(claim.responseDeadline)
                : 'six weeks from sending'}
              .
            </ThemedText>
          ) : (
            <View style={styles.cta}>
              <PrimaryButton
                label={claim ? 'Finish my claim →' : 'Generate my claim →'}
                onPress={startClaim}
              />
            </View>
          )}
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
  routeBlock: {
    gap: Spacing.half,
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
