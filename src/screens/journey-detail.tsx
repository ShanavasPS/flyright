import { useAuth } from '@clerk/expo';
import { useQuery } from '@tanstack/react-query';
import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AirlineLogo, airlineCode } from '@/components/airline-logo';
import { Card } from '@/components/card';
import { StatusChip, isOverdue, showOutcomeMenu, statusGuidance } from '@/components/claim-status';
import { PrimaryButton } from '@/components/primary-button';
import { RouteMap } from '@/components/route-map';
import { IconBadge, SheenSweep } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TravelDayTimeline } from '@/components/travel-day-timeline';
import { TripPhotos } from '@/components/trip-photos';
import { TripShareActions } from '@/components/trip-share';
import { CONVEX_URL } from '@/constants/config';
import { DEMO_DISRUPTION, DEMO_JOURNEY, isDemoJourneyId } from '@/constants/demo-journey';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useCountUp } from '@/hooks/use-count-up';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { evaluate } from '@/rules/engine';
import type { Disruption, Journey } from '@/rules/types';
import { countryName, getAirport } from '@/services/airports';
import { NEXT_STATUSES, parseSentSnapshot } from '@/services/claim-status';
import { useClaimForJourney } from '@/services/claims';
import {
  countdown,
  editedLabel,
  formatDayLabelWithYear,
  formatTime,
  travelDayTitle,
} from '@/services/dates';
import { resolveDelayMinutes } from '@/services/arrival-delay';
import { recordDelay, useDisruption } from '@/services/disruptions';
import { lookupFlight } from '@/services/flight-lookup';
import { inboundNewsworthy, inboundOutlook, type InboundOutlook } from '@/services/inbound';
import { formatDelay, inboundLegLabel } from '@/services/notification-plan';
import { noteSuccess } from '@/services/haptics';
import {
  deleteJourney,
  toDomainJourney,
  updateJourney,
  useJourney,
  useJourneys,
  type JourneyRow,
} from '@/services/journeys';
import { billingAvailable, hasPro, useProLocked } from '@/services/purchases';
import { travelWindow, type TravelStage } from '@/services/travel-day';
import { tripFacts } from '@/services/trip-facts';
import { focusWorldOn } from '@/services/world-focus';
import {
  getFlightFacts,
  noteFlightFacts,
  reconcileTravelDay,
} from '@/services/travel-day-lifecycle';
import { advanceStage, rewindStage, undoStage, useTravelDay } from '@/services/travel-day-store';
import { blockMinutes } from '@/services/timeline';

// Past this age, EU261/UK261 claim windows (2–6 years depending on country)
// have usually lapsed — the trip is journal material, not a claim.
const CLAIM_WINDOW_MS = 3 * 365 * 86_400_000;

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

/** City for the hero's endpoint caption — the code itself when the airport
 * isn't in the dataset (manual train/bus entries). */
function cityLabel(place: Journey['from']): string {
  return getAirport(place.code)?.city ?? place.code;
}

/** Block duration, "16h 35m" — null for manual entries whose bare wall-clock
 * times can't be differenced (see blockMinutes). */
function durationLabel(departure: string, arrival: string): string | null {
  const minutes = blockMinutes(departure, arrival);
  if (minutes === null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** "EK215 · Emirates"; just the number when the carrier is only its IATA
 * code (lookup rows store the code); just the carrier for entries without a
 * flight number. */
function flightLabel(journey: Journey): string {
  const carrier = journey.carrier.trim();
  if (!journey.number) return carrier;
  if (!carrier || carrier.toUpperCase() === airlineCode(journey.number)) return journey.number;
  return `${journey.number} · ${carrier}`;
}

/** The date chip's relative reading: a countdown before departure, "Flown"
 * after. */
function dateChipLabel(departure: string, now: Date): string {
  const timer = countdown(departure, now);
  if (timer.unit === 'now') return 'Boarding soon';
  if (timer.unit.endsWith('ago')) return 'Flown';
  if (timer.unit === 'hours') return `In ${timer.value} hour${timer.value === 1 ? '' : 's'}`;
  return timer.value === 1 ? 'Tomorrow' : `In ${timer.value} days`;
}

export function JourneyDetail({
  journeyId,
  embedded = false,
  routeHint,
}: {
  journeyId: string | undefined;
  /** Rendered as the right pane of the journeys screen's two-pane layout
   * (wide windows / book-postured foldables) instead of as a pushed route:
   * no stack header to configure, so the ··· trip menu moves inline, and the
   * left window inset belongs to the list pane. */
  embedded?: boolean;
  /** Route codes known before the row loads, for the header title. */
  routeHint?: { from: string; to: string };
}) {
  // Ticks so the travel-day timeline stays live while open; the coarser
  // claim-window math reads the same clock and doesn't mind the updates.
  const now = useNow(60_000).getTime();
  const router = useRouter();
  const { userId } = useAuth();
  const isDemo = isDemoJourneyId(journeyId);
  const row = useJourney(journeyId ?? 'demo', userId);
  const journey = isDemo ? DEMO_JOURNEY : row ? toDomainJourney(row) : null;
  // The whole journal, for the trip-log facts ("3rd time in Japan").
  const { data: journal } = useJourneys(userId);

  // Only 'lookup' rows track a live flight; manual journal entries and the
  // demo must never hit the status API.
  const isLookupable = !isDemo && !!journey && row?.source === 'lookup' && !!journey.number;

  // The inbound-aircraft prediction is Pro. Free users get the teaser card
  // instead, and the status call skips the rotation lookup entirely — the
  // key change refetches with it the moment an unlock lands.
  const proLocked = useProLocked();
  const upcoming = !!journey && Date.parse(journey.scheduledDeparture) > now;
  const inboundUnlocked = upcoming && !proLocked;

  // Live disruption data for tracked journeys; the demo uses a canned 195-min delay.
  const status = useQuery({
    queryKey: [
      'flight-status',
      journey?.number,
      journey?.scheduledDeparture.slice(0, 10),
      inboundUnlocked,
    ],
    queryFn: () =>
      lookupFlight(journey!.number, journey!.scheduledDeparture.slice(0, 10), {
        // Pre-departure only: past that, the rotation can't predict anything
        // and the server would skip the extra provider call anyway.
        inbound: inboundUnlocked,
      }),
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

  // The header carries WHEN the trip is — "Tomorrow", "In 5 days", "3 days
  // ago", or the date — since the route already sits in big type right
  // below it. Until the row loads, the route hint keeps the title from
  // popping in mid-transition.
  const routeTitle = journey
    ? travelDayTitle(journey.scheduledDeparture, new Date(now))
    : routeHint
      ? `${routeHint.from} → ${routeHint.to}`
      : '';

  if (!journey) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        {!embedded && <Stack.Screen options={{ title: routeTitle }} />}
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
  const travelWin = !isDemo && row ? travelWindow(row, travelState, new Date(now)) : null;
  const travelPhase = travelWin?.phase ?? 'unsupported';
  const travelActive = travelPhase === 'reminder' || travelPhase === 'live';
  // Before the window the steps still show, locked, so the traveler knows
  // what the day will look like and when the card comes alive.
  const travelPreview = travelPhase === 'before';
  // The trip log is the whole story for manual entries and forgotten flights;
  // every other state gets the notes as their own card underneath.
  const showTripLog = !disruption && !travelActive && !travelPreview && journalOnly;
  const openNotes = row
    ? () => router.push({ pathname: '/journey-note', params: { journeyId: row.id } })
    : undefined;

  // Journal entries without user-entered times store the placeholder noon
  // pair — no schedule worth showing. A lone entered time reads as a departure.
  const schedule: { departure: string; arrival: string | null } | null =
    journey.scheduledDeparture === journey.scheduledArrival
      ? journey.scheduledDeparture.endsWith('T12:00:00')
        ? null
        : { departure: formatTime(journey.scheduledDeparture), arrival: null }
      : {
          departure: formatTime(journey.scheduledDeparture),
          arrival: formatTime(journey.scheduledArrival),
        };

  // Share + circle pills for the trip cards' headers, while there's something
  // left to follow; the demo has no row to share, and the web build has no
  // Convex provider.
  const shareActions =
    CONVEX_URL && !isDemo && row && (travelActive || tripAge <= 0) ? (
      <TripShareActions journeyId={row.id} />
    ) : undefined;

  // What the inset map draws: the DB row, or the demo journey shaped like one.
  const mapSource = row ?? {
    id: journey.id,
    fromCode: journey.from.code,
    toCode: journey.to.code,
    number: journey.number,
    carrier: journey.carrier,
    scheduledDeparture: journey.scheduledDeparture,
  };

  return (
    <ThemedView style={styles.container}>
      {/* No top edge: the native stack header already owns that inset —
          including it doubled up as a blank band under the header. No bottom
          edge either: the scroll view's automatic inset already clears the
          tab bar + home indicator, so a bottom edge here was a second blank
          band the content stopped above instead of scrolling under. */}
      <SafeAreaView edges={embedded ? ['top', 'right'] : ['left', 'right']} style={styles.safeArea}>
        {/* The travel-day timeline made the tall path (title + timeline +
            verdict) overflow smaller screens — everything scrolls now. */}
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
        {mapSource && (
          <RouteMap
            journey={mapSource}
            onPress={() => {
              // Hand the trip to the World tab (see services/world-focus).
              // The demo isn't a DB row, so World shows every travel for it.
              focusWorldOn(isDemo ? null : journey.id);
              router.navigate('/world');
            }}
          />
        )}

        <RouteHero
          journey={journey}
          now={now}
          schedule={schedule}
          action={
            // Embedded panes have no stack header, so share and ··· sit inline.
            embedded ? (
              <View style={styles.inlineActions}>
                <HeaderIcon
                  label="Share this trip"
                  name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
                  onPress={() => shareTrip(journey)}
                />
                {!isDemo && row && (
                  <HeaderIcon
                    label="Trip options"
                    name={{ ios: 'ellipsis.circle', android: 'more_horiz', web: 'more_horiz' }}
                    onPress={() => showTripMenu(row.id, row.source === 'manual', router)}
                  />
                )}
              </View>
            ) : null
          }
        />

        {isLookupable && upcoming && proLocked && <InboundTeaserCard />}
        {status.data && (() => {
          const outlook = inboundOutlook(status.data);
          return outlook ? <InboundCard outlook={outlook} /> : null;
        })()}

        {(travelActive || travelPreview) && row && (
          <TravelDayTimeline
            journey={row}
            state={travelState}
            facts={getFlightFacts(row.id)}
            action={shareActions}
            locked={travelPreview}
            unlocksAt={travelWin?.startsAt}
            title={travelPreview ? 'Upcoming trip' : 'Travel day'}
            // Before the window this card IS the upcoming-trip card, so the
            // summary that used to have its own card sits under the steps.
            footer={
              travelPreview ? (
                <View style={styles.timelineFooter}>
                  <ThemedText type="small">
                    You&apos;ll fly {Math.round(journey.distanceKm).toLocaleString()} km
                    {routeSentence(journey) ? ` ${routeSentence(journey)}` : ''}.
                  </ThemedText>
                  {!journalOnly && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {status.isPending
                        ? 'Checking the latest status…'
                        : "We're watching this flight. If a delay makes you eligible for compensation, you'll know here first."}
                    </ThemedText>
                  )}
                </View>
              ) : undefined
            }
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
        ) : travelActive || travelPreview ? null : journalOnly && row ? (
          <TripLogCard
            row={row}
            userId={userId}
            journal={journal ?? []}
            now={now}
            tripAge={tripAge}
            action={shareActions}
            onEditNotes={openNotes}
          />
        ) : (
          <Card>
            <View style={styles.cardHeader}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.cardEyebrow}>
                Upcoming trip
              </ThemedText>
              {shareActions}
            </View>
            <ThemedText type="subtitle">We&apos;re watching this flight</ThemedText>
            <ThemedText type="small">
              {status.isPending && !isDemo
                ? 'Checking the latest status…'
                : "No disruption so far. If a delay makes you eligible for compensation, you'll know here first."}
            </ThemedText>
          </Card>
        )}

        {!showTripLog && row && openNotes && (
          <Card>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.cardEyebrow}>
              Your journal
            </ThemedText>
            <JournalBlock row={row} userId={userId} now={now} tripAge={tripAge} onEditNotes={openNotes} />
          </Card>
        )}

        </ScrollView>

        {/* Share and the "···" trip menu at the right — edit/remove live in
            the menu (the Tripsy pattern): edit as a plain action, remove
            destructive and last, never side by side in the content. */}
        {!embedded && (
          <Stack.Screen
            options={{
              title: routeTitle,
              headerRight: () => (
                <View style={styles.headerActions}>
                  <HeaderIcon
                    label="Share this trip"
                    name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
                    onPress={() => shareTrip(journey)}
                  />
                  {!isDemo && row && (
                    <HeaderIcon
                      label="Trip options"
                      name={{ ios: 'ellipsis.circle', android: 'more_horiz', web: 'more_horiz' }}
                      onPress={() => showTripMenu(row.id, row.source === 'manual', router)}
                    />
                  )}
                </View>
              ),
            }}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function HeaderIcon({
  label,
  name,
  onPress,
}: {
  label: string;
  name: { ios: string; android: string; web: string };
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={Spacing.two} onPress={onPress}>
      <SymbolView name={name as never} size={22} tintColor={theme.tint} />
    </Pressable>
  );
}

/** Native share sheet with a one-line trip summary. */
function shareTrip(journey: Journey) {
  const flight = journey.number ? ` on ${journey.number}` : '';
  void Share.share({
    message: `${cityLabel(journey.from)} → ${cityLabel(journey.to)}${flight}, ${formatDayLabelWithYear(journey.scheduledDeparture)} — tracked with FlyRight`,
  }).catch(() => {});
}

/** The journal card for trips with no live data to show — manual entries and
 * flights the status provider has forgotten. Says where the entry came from
 * (so a hand-typed trip is never mistaken for a tracked one), puts the trip in
 * the context of the rest of the journal, and carries the traveler's own
 * notes. The distance and block time already sit in the hero. */
function TripLogCard({
  row,
  userId,
  journal,
  now,
  tripAge,
  action,
  onEditNotes,
}: {
  row: JourneyRow;
  userId: string | null | undefined;
  journal: JourneyRow[];
  now: number;
  tripAge: number;
  action?: React.ReactNode;
  onEditNotes?: () => void;
}) {
  const theme = useTheme();
  const manual = row.source === 'manual';
  const facts = tripFacts(row, journal);
  const details = tripDetailChips(row);
  const added = formatDayLabelWithYear(row.createdAt);

  return (
    <Card>
      <View style={styles.cardHeader}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.cardEyebrow}>
          {tripAge > 0 ? 'Trip log' : 'Upcoming trip'}
        </ThemedText>
        {action}
      </View>

      <View style={styles.provenanceRow}>
        <SymbolView
          name={
            manual
              ? { ios: 'pencil', android: 'edit', web: 'edit' }
              : {
                  ios: 'antenna.radiowaves.left.and.right',
                  android: 'sensors',
                  web: 'sensors',
                }
          }
          size={14}
          tintColor={theme.textSecondary}
        />
        <ThemedText type="small" themeColor="textSecondary" style={styles.provenanceText}>
          {manual ? `Added by you · ${added}` : `Tracked flight · added ${added}`}
        </ThemedText>
      </View>

      {(details.length > 0 || facts.length > 0) && (
        <View style={styles.factRow}>
          {/* The traveler's own details lead in the tint wash; the journal's
              computed facts follow on the field colour. */}
          {details.map((detail) => (
            <View key={detail} style={[styles.factChip, { backgroundColor: `${theme.tint}1A` }]}>
              <ThemedText type="smallBold" style={[styles.factText, { color: theme.tint }]}>
                {detail}
              </ThemedText>
            </View>
          ))}
          {facts.map((fact) => (
            <View key={fact} style={[styles.factChip, { backgroundColor: theme.field }]}>
              <ThemedText type="smallBold" themeColor="heading" style={styles.factText}>
                {fact}
              </ThemedText>
            </View>
          ))}
        </View>
      )}

      {onEditNotes && (
        <>
          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
          <JournalBlock
            row={row}
            userId={userId}
            now={now}
            tripAge={tripAge}
            onEditNotes={onEditNotes}
            withDetails={false}
          />
        </>
      )}

      {tripAge > CLAIM_WINDOW_MS && (
        <ThemedText type="small" themeColor="textSecondary">
          Compensation claim windows (2–6 years depending on country) have likely passed for
          this trip.
        </ThemedText>
      )}
    </Card>
  );
}

/** "Seat 32K", "Booking ABC123" — the details the traveler typed or a
 * boarding-pass scan supplied. */
function tripDetailChips(row: JourneyRow): string[] {
  return [row.seat && `Seat ${row.seat}`, row.bookingReference && `Booking ${row.bookingReference}`].filter(
    (chip): chip is string => !!chip,
  );
}

/** Everything the traveler adds to a trip themselves: seat and booking
 * details, a star rating once it's flown, photos, and notes. The trip-log
 * card shows the detail chips in its own facts row, so it turns them off. */
function JournalBlock({
  row,
  userId,
  now,
  tripAge,
  onEditNotes,
  withDetails = true,
}: {
  row: JourneyRow;
  userId: string | null | undefined;
  now: number;
  tripAge: number;
  onEditNotes: () => void;
  withDetails?: boolean;
}) {
  const theme = useTheme();
  const details = withDetails ? tripDetailChips(row) : [];
  return (
    <View style={styles.journal}>
      {details.length > 0 && (
        <View style={styles.factRow}>
          {details.map((detail) => (
            <View key={detail} style={[styles.factChip, { backgroundColor: `${theme.tint}1A` }]}>
              <ThemedText type="smallBold" style={[styles.factText, { color: theme.tint }]}>
                {detail}
              </ThemedText>
            </View>
          ))}
        </View>
      )}
      {tripAge > 0 && <RatingRow row={row} />}
      <TripPhotos journeyId={row.id} userId={userId} />
      <NotesBlock row={row} now={now} tripAge={tripAge} onEdit={onEditNotes} />
    </View>
  );
}

const RATING_WORDS = ['', 'Rough', 'Meh', 'Fine', 'Good', 'Great'];

/** Five tappable stars. Tapping the current rating clears it. Saved straight
 * to the row, so it syncs like every other field. */
function RatingRow({ row }: { row: JourneyRow }) {
  const theme = useTheme();
  const rating = row.rating ?? 0;
  return (
    <View style={styles.ratingRow}>
      <ThemedText type="small" themeColor={rating ? 'heading' : 'textSecondary'} style={styles.ratingLabel}>
        {rating ? `${RATING_WORDS[rating]} flight` : 'How was the flight?'}
      </ThemedText>
      <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel="Rate this flight">
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityState={{ selected: rating === n }}
            accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
            hitSlop={Spacing.one}
            onPress={() => {
              void updateJourney(row.id, { rating: rating === n ? null : n });
            }}>
            <SymbolView
              name={{ ios: 'star.fill', android: 'star', web: 'star' }}
              size={24}
              tintColor={n <= rating ? theme.warning : theme.textSecondary}
              style={n <= rating ? undefined : styles.starOff}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** The traveler's notes with their last-edited stamp, or the prompt to write
 * some. The whole block opens the editor. */
function NotesBlock({
  row,
  now,
  tripAge,
  onEdit,
}: {
  row: JourneyRow;
  now: number;
  tripAge: number;
  onEdit: () => void;
}) {
  const theme = useTheme();
  if (row.notes) {
    // The note is plain, selectable text (copyable, readable by assistive
    // tech); only the Edit link is a button.
    return (
      <View>
        <View style={styles.cardHeader}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.cardEyebrow}>
            Your notes
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit your notes"
            hitSlop={Spacing.two}
            onPress={onEdit}>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              Edit
            </ThemedText>
          </Pressable>
        </View>
        <ThemedText selectable style={styles.notesText}>
          {row.notes}
        </ThemedText>
        {row.notesUpdatedAt && (
          <ThemedText type="small" themeColor="textSecondary">
            Edited {editedLabel(row.notesUpdatedAt, new Date(now))}
          </ThemedText>
        )}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tripAge > 0 ? 'Write about this trip' : 'Add a note for this trip'}
      onPress={onEdit}
      style={({ pressed }) => [styles.notesPrompt, { opacity: pressed ? 0.6 : 1 }]}>
      <SymbolView
        name={{ ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note' }}
        size={20}
        tintColor={theme.tint}
      />
      <View style={styles.notesPromptText}>
        <ThemedText type="smallBold" style={{ color: theme.tint }}>
          {tripAge > 0 ? 'Write about this trip' : 'Add a note for this trip'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Who you were with, where you sat, what you&apos;d do differently.
        </ThemedText>
      </View>
    </Pressable>
  );
}

/** The trip at a glance, the boarding-pass row the journeys list uses but on
 * the page: airline and flight number as an eyebrow with a relative date
 * chip, the two codes big at the edges with the contrail and plane between,
 * cities and times beneath. The block time sits over the contrail and the
 * distance under it, so both read as facts about the segment rather than as
 * a footnote — the pattern Polarsteps, Qantas and Flighty all use. */
function RouteHero({
  journey,
  now,
  schedule,
  action,
}: {
  journey: Journey;
  now: number;
  schedule: { departure: string; arrival: string | null } | null;
  action?: React.ReactNode;
}) {
  const theme = useTheme();
  const flown = Date.parse(journey.scheduledDeparture) <= now;
  const chip = dateChipLabel(journey.scheduledDeparture, new Date(now));
  const duration = durationLabel(journey.scheduledDeparture, journey.scheduledArrival);
  // The date lives in the screen header (travelDayTitle); the contrail
  // column carries only what belongs to the segment itself.
  const distance = `${Math.round(journey.distanceKm).toLocaleString()} km`;

  return (
    <View style={styles.hero}>
      <View style={styles.eyebrowRow}>
        <AirlineLogo number={journey.number} carrier={journey.carrier} size={28} />
        <ThemedText type="smallBold" themeColor="heading" style={styles.eyebrowText} numberOfLines={1}>
          {flightLabel(journey)}
        </ThemedText>
        <View
          style={[
            styles.chip,
            { backgroundColor: flown ? theme.field : `${theme.tint}1A` },
          ]}>
          <ThemedText
            type="smallBold"
            style={[styles.chipText, { color: flown ? theme.textSecondary : theme.tint }]}>
            {chip}
          </ThemedText>
        </View>
        {action}
      </View>

      <View accessible accessibilityLabel={`${journey.from.code} to ${journey.to.code}`} style={styles.codesRow}>
        <View style={styles.endpoint}>
          <ThemedText themeColor="heading" style={styles.code} numberOfLines={1}>
            {journey.from.code}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {cityLabel(journey.from)}
          </ThemedText>
          {schedule && <ThemedText style={styles.time}>{schedule.departure}</ThemedText>}
        </View>
        <View style={styles.contrail}>
          {/* A blank keeps the line centred on the codes when the lookup
              carried no UTC offsets and there is no block time to show. */}
          <ThemedText
            type="smallBold"
            themeColor="heading"
            style={styles.contrailLabel}
            numberOfLines={1}>
            {duration ?? ' '}
          </ThemedText>
          <View style={styles.contrailLine}>
            <ContrailDots />
            <SymbolView
              name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
              size={18}
              tintColor={theme.tint}
              style={Platform.OS === 'ios' ? undefined : styles.rotated}
            />
            <ContrailDots />
          </View>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.contrailLabel}
            numberOfLines={1}>
            {distance}
          </ThemedText>
        </View>
        <View style={[styles.endpoint, styles.endpointRight]}>
          <ThemedText themeColor="heading" style={styles.code} numberOfLines={1}>
            {journey.to.code}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {cityLabel(journey.to)}
          </ThemedText>
          {schedule && (
            <ThemedText style={styles.time}>{schedule.arrival ?? ' '}</ThemedText>
          )}
        </View>
      </View>
    </View>
  );
}

/** Half of the dotted contrail between the codes — the journeys list's
 * boarding-pass motif in the page's own palette. */
function ContrailDots() {
  const theme = useTheme();
  return (
    <View style={styles.contrailDots}>
      {Array.from({ length: 4 }, (_, i) => (
        <View key={i} style={[styles.contrailDot, { backgroundColor: theme.textSecondary }]} />
      ))}
    </View>
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

/** Where the aircraft flying this leg is right now — the delay signal the
 * departure board doesn't show. Rendered pre-departure whenever the rotation
 * is known, so the happy path ("your plane is on its way") builds trust in
 * the late path ("departure may slip ~40 min"). */
function InboundCard({ outlook }: { outlook: InboundOutlook }) {
  const leg = inboundLegLabel(outlook);
  const slip = outlook.predictedDepartureDelayMinutes;

  if (outlook.landed) {
    return (
      <Card testID="inbound-card">
        <ThemedText type="subtitle">Your plane is here</ThemedText>
        <ThemedText type="small">
          {`It landed${outlook.lateMinutes ? ` ${formatDelay(outlook.lateMinutes)} behind` : ''}, ${leg}.`}
          {slip >= 15
            ? ` Departure may still slip about ${formatDelay(slip)}.`
            : ' Boarding should run on schedule.'}
        </ThemedText>
      </Card>
    );
  }

  if (outlook.severity === 'none') {
    return (
      <Card testID="inbound-card">
        <ThemedText type="subtitle">Your plane is on its way</ThemedText>
        <ThemedText type="small">
          {`It's ${leg}${
            outlook.lateMinutes ? `, running ${formatDelay(outlook.lateMinutes)} behind` : ', on time'
          } — the schedule has enough slack to hold.`}
        </ThemedText>
      </Card>
    );
  }

  return (
    <Card testID="inbound-card">
      <ThemedText type="subtitle">Your plane is running late</ThemedText>
      <ThemedText type="small">
        {`It's ${leg}, ${formatDelay(outlook.lateMinutes)} behind — departure may slip about ${formatDelay(slip)}.`}
      </ThemedText>
      {inboundNewsworthy(outlook) && (
        <ThemedText type="small" themeColor="textSecondary">
          The airline hasn&apos;t updated the departure time yet.
        </ThemedText>
      )}
    </Card>
  );
}

/** The free user's stand-in for InboundCard — one compact row, not a pitch:
 * the question, a Pro tag, a chevron. The real details below keep the
 * screen; the paywall does the selling. Closing it comes back here, where
 * useProLocked has flipped and the full card takes the slot. */
function InboundTeaserCard() {
  const router = useRouter();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Where's your plane? Unlock with Pro"
      onPress={() => router.push('/paywall')}
      style={({ pressed }) => pressed && { opacity: 0.85 }}>
      <Card testID="inbound-teaser" style={styles.teaserRow}>
        <IconBadge symbol={{ ios: 'airplane', android: 'flight', web: 'flight' }} size={32} />
        <ThemedText themeColor="heading" style={styles.teaserTitle} numberOfLines={1}>
          Where&apos;s your plane?
        </ThemedText>
        <View style={[styles.proPill, { backgroundColor: `${theme.tint}1A` }]}>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            Pro
          </ThemedText>
        </View>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={14}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </Card>
    </Pressable>
  );
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
  // Frozen at mount, same as the Claims tab — overdue-ness needn't tick live.
  const [mountNow] = useState(() => Date.now());
  const claimOverdue = !!claim && isOverdue(claim, mountNow);

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
    // hits the paywall — Pro gates real claims only. Builds that can't sell
    // Pro (Galaxy Store) don't gate at all: no purchase path, no paywall.
    if (isDemoJourneyId(journey.id) || !billingAvailable || (await hasPro())) {
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
            <>
              <StatusChip status={claim.status} overdue={claimOverdue} />
              <ThemedText type="small" themeColor="textSecondary">
                {statusGuidance(claim, claimOverdue)}
              </ThemedText>
              {!!parseSentSnapshot(claim.sentSnapshot) && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="See what we sent"
                  hitSlop={Spacing.two}
                  onPress={() =>
                    router.push({ pathname: '/claim-letter', params: { journeyId: journey.id } })
                  }>
                  <ThemedText type="smallBold" style={{ color: theme.tint }}>
                    See what we sent →
                  </ThemedText>
                </Pressable>
              )}
              {NEXT_STATUSES[claim.status].length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Record the airline's response"
                  hitSlop={Spacing.two}
                  onPress={() => showOutcomeMenu(claim)}>
                  <ThemedText type="smallBold" style={{ color: theme.tint }}>
                    Record the airline&apos;s response →
                  </ThemedText>
                </Pressable>
              )}
            </>
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
  timelineFooter: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  container: {
    flex: 1,
  },
  teaserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  teaserTitle: {
    flex: 1,
  },
  proPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Spacing.three,
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
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three + Spacing.half,
  },
  inlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginLeft: Spacing.one,
  },
  hero: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.one,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  eyebrowText: {
    flex: 1,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two + Spacing.half,
    borderRadius: Spacing.four,
  },
  chipText: {
    fontSize: 12,
    lineHeight: 16,
  },
  codesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  endpoint: {
    flexShrink: 1,
    gap: Spacing.half,
  },
  endpointRight: {
    alignItems: 'flex-end',
  },
  code: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: 700,
    letterSpacing: -0.5,
  },
  time: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 600,
    marginTop: Spacing.one,
  },
  // Label + line + label total 54pt; the -4 margin centres the plane on the
  // 46pt code line rather than on the whole endpoint column.
  contrail: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    height: 54,
    marginTop: -4,
    paddingHorizontal: Spacing.one,
  },
  contrailLabel: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  contrailLine: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    height: 18,
  },
  contrailDots: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  contrailDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.55,
  },
  rotated: {
    transform: [{ rotate: '90deg' }],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    minHeight: 26,
  },
  cardEyebrow: {
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  provenanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
  },
  provenanceText: {
    flex: 1,
  },
  factRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  factChip: {
    paddingVertical: Spacing.one + Spacing.half,
    paddingHorizontal: Spacing.two + Spacing.half,
    borderRadius: Spacing.four,
  },
  factText: {
    fontSize: 13,
    lineHeight: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.one,
  },
  notesText: {
    marginTop: Spacing.one,
    marginBottom: Spacing.one,
  },
  journal: {
    gap: Spacing.two,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  ratingLabel: {
    flex: 1,
  },
  stars: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  starOff: {
    opacity: 0.3,
  },
  notesPrompt: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two + Spacing.half,
    paddingVertical: Spacing.one,
  },
  notesPromptText: {
    flex: 1,
    gap: Spacing.half,
  },
  cta: {
    marginTop: Spacing.two,
  },
});
