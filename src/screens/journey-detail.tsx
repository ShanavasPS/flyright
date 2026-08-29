import { useAuth } from '@clerk/expo';
import { useQuery } from '@tanstack/react-query';
import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AirlineLogo } from '@/components/airline-logo';
import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { SheenSweep } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TravelDayShare } from '@/components/travel-day-share';
import { TravelDayTimeline } from '@/components/travel-day-timeline';
import { CONVEX_URL } from '@/constants/config';
import { DEMO_DISRUPTION, DEMO_JOURNEY, isDemoJourneyId } from '@/constants/demo-journey';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useCountUp } from '@/hooks/use-count-up';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { evaluate } from '@/rules/engine';
import type { Disruption, Journey } from '@/rules/types';
import { countryName, getAirport } from '@/services/airports';
import { useClaimForJourney } from '@/services/claims';
import { formatDayLabelWithYear, formatTime } from '@/services/dates';
import { resolveDelayMinutes } from '@/services/arrival-delay';
import { recordDelay, useDisruption } from '@/services/disruptions';
import { lookupFlight } from '@/services/flight-lookup';
import { noteSuccess } from '@/services/haptics';
import { deleteJourney, toDomainJourney, useJourney } from '@/services/journeys';
import { hasPro } from '@/services/purchases';
import { travelWindow, type TravelStage } from '@/services/travel-day';
import {
  getFlightFacts,
  noteFlightFacts,
  reconcileTravelDay,
} from '@/services/travel-day-lifecycle';
import { advanceStage, rewindStage, undoStage, useTravelDay } from '@/services/travel-day-store';

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
  // Ticks so the travel-day timeline stays live while open; the coarser
  // claim-window math reads the same clock and doesn't mind the updates.
  const now = useNow(60_000).getTime();
  const router = useRouter();
  const theme = useTheme();
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

  // Persist the full fact set (gate, boarding, actual times) for the live
  // surfaces, then let the reconciler update the ongoing notification.
  const observedFacts = status.data;
  useEffect(() => {
    if (isDemo || !rowId || !observedFacts) return;
    noteFlightFacts(rowId, observedFacts)
      .then(() => reconcileTravelDay())
      .catch(() => {});
  }, [isDemo, rowId, observedFacts]);

  const travelState = useTravelDay(rowId ?? '');

  // The delay cache the journeys list badges from — the status provider
  // forgets flights long before claim windows close, so a landed flight's
  // recorded delay must keep the verdict alive once live lookups 404.
  const recorded = useDisruption(isDemo ? undefined : rowId);

  if (!journey) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const tripAge = now - Date.parse(journey.scheduledDeparture);

  // Recorded delays outside the claim window stay journal material — no point
  // resurrecting a CTA for a claim that can no longer be filed.
  const delayMinutes = isDemo
    ? DEMO_DISRUPTION.delayMinutes
    : resolveDelayMinutes(
        status.data,
        tripAge <= CLAIM_WINDOW_MS ? recorded?.delayMinutes : null,
      );
  const disruption: Disruption | null =
    delayMinutes != null ? { type: 'delay', delayMinutes } : null;
  // A verdict is a bonus on top of the journal — when we can't get live data
  // (manual entries, flights the provider no longer remembers), the trip
  // simply reads as history instead of showing a spinner or an error.
  const journalOnly = !isDemo && (!isLookupable || status.isError);

  // Inside the travel window the live timeline takes over from the passive
  // "watching" copy; the verdict card still wins when there's money on it.
  const travelPhase =
    !isDemo && row ? travelWindow(row, travelState, new Date(now)).phase : 'unsupported';
  const travelActive = travelPhase === 'reminder' || travelPhase === 'live';

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
      {/* No top edge: the native stack header already owns that inset —
          including it doubled up as a blank band under the header. */}
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
        {/* The travel-day timeline made the tall path (title + timeline +
            verdict) overflow smaller screens — everything scrolls now. */}
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
        <View style={styles.titleRow}>
          <AirlineLogo number={journey.number} carrier={journey.carrier} size={48} />
          <ThemedText type="title" themeColor="heading" style={styles.titleText}>
            {journey.number ? `${journey.carrier} ${journey.number}` : journey.carrier}
          </ThemedText>
        </View>
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

        {travelActive && row && (
          <TravelDayTimeline
            journey={row}
            state={travelState}
            facts={getFlightFacts(row.id)}
            action={CONVEX_URL ? <TravelDayShare journeyId={row.id} /> : undefined}
            onAdvance={(stage: TravelStage) => {
              void advanceStage(row.id, stage, row.source === 'manual').then(() =>
                reconcileTravelDay(),
              );
            }}
            onRewind={(stage: TravelStage) => {
              void rewindStage(row.id, stage, row.source === 'manual').then(() =>
                reconcileTravelDay(),
              );
            }}
            onUndo={() => {
              void undoStage(row.id, row.source === 'manual').then(() => reconcileTravelDay());
            }}
          />
        )}

        {disruption ? (
          <VerdictCard journey={journey} disruption={disruption} />
        ) : travelActive ? null : journalOnly ? (
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

        </ScrollView>

        {/* Edit/remove live in a header "···" menu (the Flighty/Tripsy
            pattern): edit as a plain action, remove destructive and last,
            never side by side in the content. */}
        {!isDemo && row && (
          <Stack.Screen
            options={{
              headerRight: () => (
                <Pressable
                  accessibilityLabel="Trip options"
                  hitSlop={Spacing.three}
                  onPress={() => showTripMenu(row.id, row.source === 'manual', router)}>
                  <SymbolView
                    name={{ ios: 'ellipsis.circle', android: 'more_horiz', web: 'more_horiz' }}
                    size={22}
                    tintColor={theme.tint}
                  />
                </Pressable>
              ),
            }}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function confirmRemove(journeyId: string, router: ReturnType<typeof useRouter>) {
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
}

/** Native "···" menu: Edit (journal entries only), then destructive Remove. */
function showTripMenu(journeyId: string, editable: boolean, router: ReturnType<typeof useRouter>) {
  const edit = () => router.push({ pathname: '/add-flight', params: { editId: journeyId } });
  const remove = () => confirmRemove(journeyId, router);

  if (Platform.OS === 'ios') {
    const options = editable
      ? ['Edit trip details', 'Remove from My travels', 'Cancel']
      : ['Remove from My travels', 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        destructiveButtonIndex: editable ? 1 : 0,
        cancelButtonIndex: options.length - 1,
      },
      (index) => {
        if (editable && index === 0) edit();
        else if (index === (editable ? 1 : 0)) remove();
      },
    );
    return;
  }

  Alert.alert('Trip options', undefined, [
    ...(editable ? [{ text: 'Edit trip details', onPress: edit }] : []),
    { text: 'Remove from My travels', style: 'destructive' as const, onPress: remove },
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

// One success buzz per journey per app session — the verdict is a thrill the
// first time it appears, a fact every time after.
const celebratedJourneys = new Set<string>();

function VerdictCard({ journey, disruption }: { journey: Journey; disruption: Disruption }) {
  const router = useRouter();
  const theme = useTheme();
  const verdict = evaluate(journey, disruption);
  // Never set for the demo journey — there's no DB row to claim against.
  const claim = useClaimForJourney(journey.id);
  const claimSent = !!claim && claim.status !== 'draft';

  const owed = verdict.eligible && verdict.compensation ? verdict.compensation.amount : 0;
  const shownAmount = useCountUp(owed);
  useEffect(() => {
    if (owed && !celebratedJourneys.has(journey.id)) {
      celebratedJourneys.add(journey.id);
      noteSuccess();
    }
  }, [owed, journey.id]);

  const startClaim = async () => {
    const delay = String(disruption.delayMinutes ?? 0);
    // The demo exists to show off the whole verdict → letter flow, so it never
    // hits the paywall — Pro gates real claims only.
    if (isDemoJourneyId(journey.id) || (await hasPro())) {
      router.push({ pathname: '/claim', params: { journeyId: journey.id, delay } });
      return;
    }
    // `next` lets the paywall continue straight into the claim wizard after an
    // unlock instead of bouncing back here for a second tap.
    router.push({
      pathname: '/paywall',
      params: { next: `/claim?journeyId=${encodeURIComponent(journey.id)}&delay=${delay}` },
    });
  };

  return (
    <Animated.View entering={FadeInUp.duration(400)}>
    <Card style={verdict.eligible ? styles.verdictCard : undefined}>
      {verdict.eligible && verdict.compensation ? (
        <>
          <SheenSweep />
          <ThemedText type="display" style={{ color: theme.success }}>
            You&apos;re owed {shownAmount} {verdict.compensation.currency}
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Clips the SheenSweep to the card's rounded corners.
  verdictCard: {
    overflow: 'hidden',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  titleText: {
    flex: 1,
  },
  routeBlock: {
    gap: Spacing.half,
  },
  cta: {
    marginTop: Spacing.two,
  },
});
