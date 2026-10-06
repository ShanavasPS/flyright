import { useAuth } from '@clerk/expo';
import { useQuery } from '@tanstack/react-query';
import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
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

import { BoardingPassCard } from '@/components/boarding-pass-card';
import { Card } from '@/components/card';
import { DataErrorState, LoadingState, MissingState } from '@/components/data-state';
import { StatusChip, isOverdue, showOutcomeMenu, statusGuidance } from '@/components/claim-status';
import { PrimaryButton } from '@/components/primary-button';
import { RouteHero, cityLabel, type Schedule } from '@/components/route-hero';
import { RouteMap } from '@/components/route-map';
import { OwnUpdatesCard } from '@/components/own-updates-card';
import { SheenSweep } from '@/components/sheen-card';
import { FlashToast } from '@/components/flash-toast';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ProgressExpandButton, TravelProgressStrip } from '@/components/travel-progress-strip';
import { TravelDayTimeline } from '@/components/travel-day-timeline';
import { LoungeLine } from '@/components/lounge-line';
import { TripClockStrip, TripFactsCard, TripStatusRow } from '@/components/trip-card';
import { TripDocuments } from '@/components/trip-documents';
import { TripPhotos } from '@/components/trip-photos';
import { useCircleFollowers, useVisibilityChooser } from '@/components/trip-audience';
import { TripShareActions } from '@/components/trip-share';
import { CONVEX_URL } from '@/constants/config';
import { DEMO_DISRUPTION, DEMO_JOURNEY, isDemoJourneyId } from '@/constants/demo-journey';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useCountUp } from '@/hooks/use-count-up';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { evaluate } from '@/rules/engine';
import type { Disruption, Journey } from '@/rules/types';
import { trackEvent } from '@/services/analytics';
import { airportZone, countryName, getAirport } from '@/services/airports';
import { NEXT_STATUSES, parseSentSnapshot } from '@/services/claim-status';
import { useClaimForJourney } from '@/services/claims';
import {
  dayOffset,
  editedLabel,
  formatDayLabel,
  formatDayLabelWithYear,
  flightInstant,
  formatTime,
  tripDateTitle,
} from '@/services/dates';
import { resolveDelayMinutes } from '@/services/arrival-delay';
import { recordDelay, useDisruption } from '@/services/disruptions';
import { FlightLookupError, lookupFlight } from '@/services/flight-lookup';
import { useFlightPath } from '@/services/flight-path';
import { inboundNewsworthy, inboundOutlook, type InboundOutlook } from '@/services/inbound';
import { formatDelay, inboundLegLabel } from '@/services/notification-plan';
import { noteSuccess, tapLight } from '@/services/haptics';
import {
  deleteJourney,
  setJourneyVisibility,
  toDomainJourney,
  updateJourney,
  useJourney,
  useJourneys,
  type JourneyRow,
} from '@/services/journeys';
import { MoveCard } from '@/components/home-base';
import { useHomeContext } from '@/hooks/use-home-base';
import { airportPlace, autoHome, departureDay, homeCheck, markMove, moveCandidate } from '@/services/home-base';
import { dismissHomePrompt, updateHomeBase } from '@/services/home-base-store';
import { ProTripCard } from '@/components/pro-trip-card';
import { hasPro, useProLocked } from '@/services/purchases';
import { shiftLabel } from '@/services/schedule-change';
import { applyScheduleChange, lookupDayFor } from '@/services/schedule-change-lifecycle';
import {
  DEFAULT_PLAN,
  chosenPlan,
  EMPTY_FACTS,
  flightProgress,
  hasLanded,
  isTravelerStage,
  stageRules,
  travelWindow,
  type TravelStage,
} from '@/services/travel-day';
import { stagePlanFor } from '@/services/travel-day-plan';
import { tripCard } from '@/services/trip-card';
import { tripFacts } from '@/services/trip-facts';
import { carrierCode, earningLine } from '@/services/loyalty-programmes';
import { useMemberships } from '@/services/memberships';
import { visibilityChip, visibilityOf } from '@/services/trip-visibility';
import { focusWorldOn } from '@/services/world-focus';
import { ALL_TIME } from '@/services/world-period';
import { openWorldShare } from '@/services/world-share';
import { factsFor, noteFlightFacts, reconcileTravelDay } from '@/services/travel-day-lifecycle';
import { advanceStage, rewindStage, undoStage, useTravelDay } from '@/services/travel-day-store';

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
  const { userId, isLoaded: authLoaded } = useAuth();
  const isDemo = isDemoJourneyId(journeyId);
  const { row, loaded: rowLoaded, error: rowError } = useJourney(journeyId ?? 'demo', userId);
  const journey = isDemo ? DEMO_JOURNEY : row ? toDomainJourney(row) : null;
  // The whole journal, for the trip-log facts ("3rd time in Japan").
  const { data: journal } = useJourneys(userId);
  // "Was this the flight you moved on?" (docs/home-base.md).
  const homeContext = useHomeContext(userId, journal);
  const moveTo = useMemo(
    () => (row && journal && homeContext.state.loaded && !embedded ? moveCandidate(homeContext.state, journal, row, new Date(now)) : null),
    [row, journal, homeContext.state, embedded, now],
  );
  const answerMove = (moved: boolean) => {
    if (!row || !moveTo) return;
    if (!moved) return dismissHomePrompt(userId, `move:${row.id}`);
    const day = departureDay(row);
    const before = autoHome((journal ?? []).filter(r => departureDay(r) < day));
    updateHomeBase(userId, s => ({ periods: markMove(s, moveTo, day, before) }));
  };

  // Only 'lookup' rows track a live flight; manual journal entries and the
  // demo must never hit the status API.
  const isLookupable = !isDemo && !!journey && row?.source === 'lookup' && !!journey.number;

  // The inbound-aircraft prediction is Pro. Free users get the teaser card
  // instead, and the status call skips the rotation lookup entirely — the
  // key change refetches with it the moment an unlock lands.
  const proLocked = useProLocked();
  // Who sees this trip — the chooser the ··· menu and the circle pill open.
  const followers = useCircleFollowers();
  const { choose: chooseAudience, sheet: audienceSheet } = useVisibilityChooser(followers);
  const upcoming = !!journey && Date.parse(journey.scheduledDeparture) > now;
  const inboundUnlocked = upcoming && !proLocked;

  // Live disruption data for tracked journeys; the demo uses a canned 195-min delay.
  // The flight's own local date at its origin — the key the provider expects.
  // Slicing the stored instant asks about the wrong day for a departure that
  // straddles UTC midnight (see dates.flightDay).
  const lookupDay = row ? lookupDayFor(row) : undefined;
  // Set when the traveller runs the free delay check themselves: then a "no
  // compensation" answer is shown, since they asked. Otherwise a verdict
  // only appears when there is money on it.
  const [askedDelay, setAskedDelay] = useState(false);
  const status = useQuery({
    queryKey: ['flight-status', journey?.number, lookupDay, userId ?? 'guest', inboundUnlocked, proLocked],
    queryFn: () =>
      lookupFlight(journey!.number, lookupDay!, {
        // Pre-departure only: past that, the rotation can't predict anything
        // and the server would skip the extra provider call anyway.
        inbound: inboundUnlocked,
        purpose: proLocked ? 'schedule' : 'monitor',
      }),
    enabled: isLookupable && authLoaded && !proLocked,
    staleTime: 5 * 60 * 1000,
    refetchInterval: !proLocked && row && Date.parse(row.scheduledArrival) + 3_600_000 > now ? 2 * 60_000 : false,
    retry: false,
  });

  // The line the inset map draws: the flight's recorded track or filed
  // route, when the path lookup has one; the great circle until then. Only
  // for tracked flights — a journal entry has nothing to look up.
  const flightPath = useFlightPath(
    isLookupable && row && lookupDay && (!proLocked || now - Date.parse(row.scheduledDeparture) > 3 * 86_400_000)
      ? {
          number: journey!.number,
          fromCode: row.fromCode,
          toCode: row.toCode,
          scheduledDeparture: row.scheduledDeparture,
          scheduledArrival: row.scheduledArrival,
          date: lookupDay,
        }
      : null,
    now,
  );

  // Cache any observed delay so the journeys list can badge this row as owed
  // without its own status call (see services/disruptions.ts).
  const rowId = row?.id;
  const observedDelay = status.data?.delayMinutes;
  useEffect(() => {
    if (isDemo || !rowId || observedDelay == null) return;
    recordDelay(rowId, observedDelay).catch(() => {});
  }, [isDemo, rowId, observedDelay]);

  // Opening a trip is also when a schedule change gets noticed: the lookup
  // above already carries what the airline currently publishes.
  const lookedUp = status.data;
  useEffect(() => {
    if (isDemo || !row || !lookedUp) return;
    applyScheduleChange(row, lookedUp).catch(() => {});
  }, [isDemo, row, lookedUp]);

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
  // How far along the flight is while it is in the air — the same reckoning
  // as the Live Activity's bar — for the route hero's contrail and the inset's
  // plane. Null on the ground either side, and for the demo.
  const liveProgress = useMemo(() => {
    if (isDemo || !row || proLocked) return null;
    const fraction = flightProgress(row, travelState, factsFor(row), new Date(now));
    return fraction > 0 && fraction < 1 ? fraction : null;
  }, [isDemo, row, travelState, now, proLocked]);
  // Which stages this leg's travel day has: the whole airport walk for a
  // flight on its own, transit security and the arrival steps for a leg of
  // a longer itinerary — read off the journal, since the other legs decide.
  const travelPlan = useMemo(
    () =>
      chosenPlan(
        travelState,
        row && journal ? stagePlanFor(row, journal, homeCheck(homeContext.state, journal)) : DEFAULT_PLAN,
      ),
    [row, journal, travelState, homeContext.state],
  );
  // What the traveller may tap right now. Depends on the clock as well as the
  // row: a flight overdue with no arrival reported opens its own landing, so
  // an airport that never tells the provider a flight is down can't strand
  // the trip in the air (see landingDue).
  const travelRules = useMemo(
    () =>
      row
        ? stageRules(row, travelState, factsFor(row), new Date(now), travelPlan)
        : { manualTrip: false, plan: travelPlan },
    [row, travelState, now, travelPlan],
  );

  // The delay cache the journeys list badges from — the status provider
  // forgets flights long before claim windows close, so a landed flight's
  // recorded delay must keep the verdict alive once live lookups 404.
  const recorded = useDisruption(isDemo ? undefined : rowId);

  // The header carries WHEN the trip is — "Tomorrow", "In 5 days", "3 days
  // ago", or the date — since the route already sits in big type right
  // below it. Until the row loads, the route hint keeps the title from
  // popping in mid-transition.
  const routeTitle = journey
    ? tripDateTitle(journey.scheduledDeparture, new Date(now), airportZone(journey.from.code))
    : routeHint
      ? `${routeHint.from} → ${routeHint.to}`
      : '';

  if (!journey) {
    // Three different frames: the row is still being read, the read failed,
    // or nothing matches the id (removed on another device, a stale link).
    return (
      <ThemedView style={styles.container}>
        {!embedded && <Stack.Screen options={{ title: routeTitle }} />}
        {rowError ? (
          <DataErrorState error={rowError} title="Couldn't read this trip" />
        ) : rowLoaded ? (
          <MissingState
            title="This trip isn't in your journal"
            detail="It may have been removed on another device, or the link is out of date."
          />
        ) : (
          <LoadingState />
        )}
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
  const verdictOwed = !!disruption && !!evaluate(journey, disruption).compensation;
  const showVerdict = !!disruption && (askedDelay || verdictOwed);
  // A verdict is a bonus on top of the journal — when we can't get live data
  // (manual entries, flights the provider no longer remembers), the trip
  // simply reads as history instead of showing a spinner or an error.
  const journalOnly = !isDemo && (!isLookupable || status.isError || proLocked);

  // Inside the travel window the live timeline takes over from the passive
  // "watching" copy; the verdict card still wins when there's money on it.
  const travelWin = !isDemo && row ? travelWindow(row, travelState, new Date(now), travelPlan) : null;
  const travelPhase = travelWin?.phase ?? 'unsupported';
  const travelActive = !proLocked && (travelPhase === 'reminder' || travelPhase === 'live');
  const openNotes = row
    ? () => router.push({ pathname: '/journey-note', params: { journeyId: row.id } })
    : undefined;

  // Which moment of the trip the page is laid out for (A2): before the
  // travel window, the travel day itself, landed inside the window, or a
  // trip in the past. orderedSlots says what leads in each.
  const landedNow = hasLanded(travelState.stage);
  // Free users get a free delay check once the flight is down.
  const delayCheck = proLocked && isLookupable && !!row && Date.parse(row.scheduledArrival) < now && !disruption;
  const moment: TripMoment = travelActive
    ? landedNow
      ? 'landed'
      : 'travel'
    : tripAge > 0
      ? 'past'
      : 'saved';

  // Journal entries without user-entered times store the placeholder noon
  // pair — no schedule worth showing. A lone entered time reads as a departure.
  // Each end reads in its own airport's clock — the pair a boarding pass
  // prints, and the only pair that stays true wherever the trip is read from.
  const departureZone = airportZone(journey.from.code);
  const arrivalZone = airportZone(journey.to.code);
  // Set only once the airline has moved the flight (services/schedule-change):
  // the times the ticket was booked at, so the card can show what changed
  // rather than quietly swapping the number the traveler wrote down.
  // Each end separately, and only when it really differs: an airline that
  // moved the flight and then put it back, or the same time saved in another
  // form, must not show a clock struck through above itself.
  const changed = (ticketed: string | null | undefined, current: string, zone: string | null) =>
    !!ticketed && flightInstant(ticketed, zone) !== flightInstant(current, zone);
  const departureWas =
    row && changed(row.ticketedDeparture, journey.scheduledDeparture, departureZone)
      ? formatTime(row.ticketedDeparture!, departureZone)
      : null;
  const arrivalWas =
    row && changed(row.ticketedArrival, journey.scheduledArrival, arrivalZone)
      ? formatTime(row.ticketedArrival!, arrivalZone)
      : null;
  const movedMinutes = departureWas
    ? Math.round(
        (flightInstant(journey.scheduledDeparture, departureZone) -
          flightInstant(row!.ticketedDeparture!, departureZone)) /
          60_000,
      )
    : null;
  const moved = movedMinutes ? shiftLabel(movedMinutes) : null;
  // The header names the departure day; a landing on another day is
  // marked on its clock and spelled out under it.
  const landsDaysLater = dayOffset(journey.scheduledDeparture, departureZone, journey.scheduledArrival, arrivalZone);
  const schedule: Schedule | null =
    journey.scheduledDeparture === journey.scheduledArrival
      ? journey.scheduledDeparture.endsWith('T12:00:00')
        ? null
        : {
            departure: formatTime(journey.scheduledDeparture, departureZone),
            arrival: null,
            departureWas,
            arrivalWas: null,
            moved,
          }
      : {
          departure: formatTime(journey.scheduledDeparture, departureZone),
          arrival: formatTime(journey.scheduledArrival, arrivalZone),
          arrivalDayOffset: landsDaysLater,
          arrivalDay: landsDaysLater ? formatDayLabel(journey.scheduledArrival, arrivalZone) : null,
          departureWas,
          arrivalWas,
          moved,
        };

  // Share + circle pills for the trip cards' headers, while there's something
  // left to follow; the demo has no row to share, and the web build has no
  // Convex provider.
  // Trip privacy is a circle feature: without Convex there is no circle to
  // hide from, so the menu doesn't offer it.
  const privacyOn = !!CONVEX_URL;
  const changeAudience = row
    ? () =>
        chooseAudience(visibilityOf(row), (next) => {
          trackEvent('circle_trip_audience', { audience: next, from: 'trip' });
          void setJourneyVisibility(row.id, next);
        })
    : null;
  const shareActions =
    CONVEX_URL && !isDemo && row && changeAudience && (travelActive || tripAge <= 0) ? (
      <TripShareActions
        journeyId={row.id}
        visibility={visibilityOf(row)}
        plan={travelPlan}
        onChangeAudience={changeAudience}
      />
    ) : undefined;

  // Share = the poster the World tab makes for one flight (screens/share-world),
  // for a real row on a platform that can rasterise it. The demo has no row,
  // and web has no view-shot, so they keep the one-line text share.
  const shareThisTrip = () => {
    if (row && !isDemo && Platform.OS !== 'web') {
      openWorldShare({ rows: [row], period: ALL_TIME, kind: 'route' });
      router.push('/share-world');
    } else if (journey) {
      shareTrip(journey);
    }
  };

  // Embedded panes have no stack header, so share and ··· sit inline — on
  // the trip card when there is one, else on the route hero.
  const inlineActions = (
    <View style={styles.inlineActions}>
      <HeaderIcon
        label="Share this trip"
        name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
        onPress={shareThisTrip}
      />
      {!isDemo && row && (
        <HeaderIcon
          label="Trip options"
          name={{ ios: 'ellipsis.circle', android: 'more_horiz', web: 'more_horiz' }}
          onPress={() => showTripMenu(row.id, row.source === 'manual', privacyOn ? changeAudience : null, router, embedded)}
        />
      )}
    </View>
  );

  // What every live piece of the page draws from: the latest airport facts
  // with the trip's record filling the gaps (a gate typed by the traveller,
  // the belt once the live facts are gone).
  const facts = row && !isDemo ? factsFor(row) : EMPTY_FACTS;
  const card =
    row && !isDemo
      ? tripCard({
          row,
          facts,
          state: travelState,
          phase: travelPhase,
          now: new Date(now),
          statusKnown: !!status.data,
          monitoring: !proLocked,
        })
      : null;

  // What the inset map draws: the DB row, or the demo journey shaped like one.
  const mapSource = row ?? {
    id: journey.id,
    fromCode: journey.from.code,
    toCode: journey.to.code,
    number: journey.number,
    carrier: journey.carrier,
    scheduledDeparture: journey.scheduledDeparture,
    scheduledArrival: journey.scheduledArrival,
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
          contentContainerStyle={styles.scrollContent}
>
        {mapSource && (
          <RouteMap
            journey={mapSource}
            path={flightPath}
            live={row && !isDemo && !proLocked ? { journey: row, state: travelState, facts, now } : null}
            onPress={() => {
              // Hand the trip to the World tab (see services/world-focus).
              // The demo isn't a DB row, so World shows every travel for it.
              focusWorldOn(isDemo ? null : journey.id);
              router.navigate('/world');
            }}
          />
        )}

        {/* The head (A2): the flight and its status, the route with its
            times, and the countdown — or the landing — as one small strip
            under them. Everything else is a card below, in the order the
            trip's moment needs it. */}
        {card && <TripStatusRow model={card} journey={journey} action={embedded ? inlineActions : undefined} />}

        <RouteHero
          journey={journey}
          now={now}
          schedule={schedule}
          progress={liveProgress}
          eyebrow={!card}
          action={!card && embedded ? inlineActions : null}
        />

        {card && <TripClockStrip model={card} />}

        {status.error instanceof FlightLookupError && status.error.signInRequired && (
          <Card>
            <ThemedText type="smallBold">{status.error.message}</ThemedText>
            <Pressable
              onPress={() => router.push({
                pathname: '/sign-in',
                params: { next: `/journey/${encodeURIComponent(journey.id)}` },
              })}>
              <ThemedText type="link">Sign in for live flight updates →</ThemedText>
            </Pressable>
          </Card>
        )}

        {moveTo && row && (
          <MoveCard
            to={moveTo}
            from={airportPlace(row.fromCode, row.fromCountry)}
            onYes={() => answerMove(true)}
            onNo={() => answerMove(false)}
          />
        )}

        {!proLocked && status.data && (() => {
          const outlook = inboundOutlook(status.data);
          return outlook ? <InboundCard outlook={outlook} /> : null;
        })()}

        {orderedSlots(moment).map((slot) => {
          switch (slot) {
            case 'pass':
              return !isDemo && row ? (
                <BoardingPassCard key={slot} row={row} prominent={moment === 'travel' || moment === 'saved'} />
              ) : null;
            case 'airport':
              return card && row ? (
                <TripFactsCard
                  key={slot}
                  testID="trip-airport-card"
                  model={card}
                  part="airport"
                  afterFirst={
                    row.mode === 'flight' && (moment === 'saved' || moment === 'travel') ? <LoungeLine trip={row} /> : null
                  }
                  onEdit={(field) => router.push({ pathname: '/trip-details', params: { journeyId: row.id, field } })}
                />
              ) : null;
            case 'ticket':
              return card && row ? (
                <TripFactsCard
                  key={slot}
                  testID="trip-ticket-card"
                  model={card}
                  part="ticket"
                  onEdit={(field) => router.push({ pathname: '/trip-details', params: { journeyId: row.id, field } })}>
                  <EarningLine number={row.mode === 'flight' ? row.number : ''} />
                </TripFactsCard>
              ) : null;
            case 'progress':
              // A flown trip keeps its progress as a record: which steps were
              // marked and when — when the traveller marked any. Take-off and
              // landing alone come from flight data on every tracked flight,
              // and a walk nobody used would be a column of "Skipped".
              if (!travelActive && row && moment === 'past') {
                const marked = travelPlan.some(
                  (s) => travelState.stamps[s] !== undefined && (row.source === 'manual' || isTravelerStage(s)),
                );
                return marked ? (
                  <TravelDayTimeline
                    key={slot}
                    journey={row}
                    state={travelState}
                    facts={facts}
                    plan={travelPlan}
                    readOnly
                    action={
                      <ProgressExpandButton
                        onPress={() => router.push({ pathname: '/trip-progress', params: { journeyId: row.id } })}
                      />
                    }
                  />
                ) : null;
              }
              return travelActive && row ? (
                <TravelProgressStrip
                  key={slot}
                  journey={row}
                  state={travelState}
                  facts={facts}
                  plan={travelPlan}
                  onAdvance={(stage: TravelStage) => {
                    void advanceStage(row.id, stage, travelRules).then(() => reconcileTravelDay());
                  }}
                  onRewind={(stage: TravelStage) => {
                    void rewindStage(row.id, stage, travelRules).then(() => reconcileTravelDay());
                  }}
                  onUndo={() => {
                    void undoStage(row.id, travelRules).then(() => reconcileTravelDay());
                  }}
                  onExpand={() => router.push({ pathname: '/trip-progress', params: { journeyId: row.id } })}
                />
              ) : null;
            case 'updates':
              // What the traveller shares with the people following this
              // trip, from the day they fly until a day after landing.
              return CONVEX_URL && !isDemo && row ? (
                <OwnUpdatesCard key={slot} row={row} travel={travelState} now={new Date(now)} />
              ) : null;
            case 'pro':
              return !isDemo && row && proLocked ? <ProTripCard key={slot} trip={row} /> : null;
            case 'claims':
              return delayCheck || showVerdict ? (
                <View key={slot} style={styles.slot}>
                  {delayCheck && (
                    <Card>
                      <ThemedText type="smallBold">Was this flight delayed?</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">Check its final arrival delay for free. Preparing a claim with FlyRight needs Pro.</ThemedText>
                      <PrimaryButton label={status.isFetching ? 'Checking…' : 'Check eligibility'} disabled={status.isFetching} onPress={() => {
                          setAskedDelay(true);
                          void status.refetch();
                        }}
                      />
                      {status.isError && <ThemedText type="small" themeColor="textSecondary">We couldn’t retrieve the arrival. Try again later. Your flight is still saved.</ThemedText>}
                      {status.data && status.data.delayMinutes == null && <ThemedText type="small" themeColor="textSecondary">The final arrival time isn’t available yet.</ThemedText>}
                    </Card>
                  )}
                  {showVerdict && disruption && <VerdictCard journey={journey} disruption={disruption} />}
                </View>
              ) : null;
            case 'journal':
              return row && openNotes ? (
                <JournalCard
                  key={slot}
                  row={row}
                  userId={userId}
                  now={now}
                  tripAge={tripAge}
                  flown={moment === 'landed' || moment === 'past'}
                  onEditNotes={openNotes}
                />
              ) : null;
            case 'about':
              return row || isDemo ? (
                <AboutTripCard
                  key={slot}
                  row={row ?? null}
                  journal={journal ?? []}
                  tripAge={tripAge}
                  watching={!journalOnly && !disruption && tripAge <= 0 && !travelActive}
                  summary={tripAge <= 0 && journey.distanceKm ? `You'll fly ${Math.round(journey.distanceKm).toLocaleString()} km${routeSentence(journey) ? ` ${routeSentence(journey)}` : ''}.` : null}
                  checking={status.isFetching && !isDemo}
                  action={shareActions}
                />
              ) : null;
          }
        })}

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
                    onPress={shareThisTrip}
                  />
                  {!isDemo && row && (
                    <HeaderIcon
                      label="Trip options"
                      name={{ ios: 'ellipsis.circle', android: 'more_horiz', web: 'more_horiz' }}
                      onPress={() =>
                      showTripMenu(row.id, row.source === 'manual', privacyOn ? changeAudience : null, router, embedded)
                    }
                    />
                  )}
                </View>
              ),
            }}
          />
        )}
        {audienceSheet}
      </SafeAreaView>
      {/* "Update shared" once the composer closes over this trip. */}
      <FlashToast />
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
    message: `${cityLabel(journey.from)} → ${cityLabel(journey.to)}${flight}, ${formatDayLabelWithYear(journey.scheduledDeparture, airportZone(journey.from.code))} — tracked with FlyRight`,
  }).catch(() => {});
}

type TripMoment = 'saved' | 'travel' | 'landed' | 'past';
type Slot = 'pass' | 'airport' | 'ticket' | 'progress' | 'updates' | 'pro' | 'claims' | 'journal' | 'about';

/** The trip page's cards by what the moment needs (the A2 study, design
 * canvas "Trip details & Memberships alternatives"):
 *  - saved: close the ticket's gaps first; the airport card is still empty.
 *  - travel: the next hour, in the order it is needed — pass, gate, steps.
 *  - landed: belt and bags, a claim if one is owed, then the journal while
 *    it is fresh.
 *  - past: any claim, then the memory; the airport record last. */
function orderedSlots(moment: TripMoment): Slot[] {
  switch (moment) {
    case 'saved':
      return ['ticket', 'pass', 'airport', 'pro', 'claims', 'journal', 'about'];
    case 'travel':
      return ['pass', 'airport', 'claims', 'progress', 'updates', 'ticket', 'journal', 'about'];
    case 'landed':
      return ['airport', 'claims', 'progress', 'journal', 'updates', 'about', 'ticket', 'pass'];
    case 'past':
      return ['claims', 'pro', 'journal', 'progress', 'updates', 'ticket', 'airport', 'about', 'pass'];
  }
}

/** "Earns Qpoints · Privilege Club Gold" under the ticket, when a
 * membership on this phone earns on the flight's airline or an alliance
 * partner (services/loyalty-programmes). Tapping it opens Memberships. */
function EarningLine({ number }: { number: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { userId } = useAuth();
  const memberships = useMemberships(userId);
  const line = memberships?.length ? earningLine(carrierCode(number), memberships) : null;
  if (!line) return null;
  return (
    <Pressable
      testID="trip-earning"
      accessibilityRole="button"
      accessibilityLabel={line}
      accessibilityHint="Opens your memberships"
      onPress={() => router.push('/memberships')}
      style={({ pressed }) => [styles.earning, { borderTopColor: theme.hairline }, pressed && { opacity: 0.6 }]}>
      <SymbolView name={{ ios: 'star.circle', android: 'stars', web: 'stars' }} size={16} tintColor={theme.warning} />
      <ThemedText type="small" themeColor="heading" style={styles.earningText} numberOfLines={1}>
        {line}
      </ThemedText>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        size={12}
        tintColor={theme.textSecondary}
      />
    </Pressable>
  );
}

/** What the trip is in the traveller's story: where it came from, who sees
 * it, what it means in the journal ("First time in Japan"), the share
 * controls — and, before a tracked flight, that FlyRight is watching it. */
function AboutTripCard({
  row,
  journal,
  tripAge,
  watching,
  summary,
  checking,
  action,
}: {
  row: JourneyRow | null;
  journal: JourneyRow[];
  tripAge: number;
  watching: boolean;
  /** "You'll fly 1,853 km from Helsinki to London." before the trip. */
  summary: string | null;
  checking: boolean;
  action?: React.ReactNode;
}) {
  const theme = useTheme();
  const facts = row ? tripFacts(row, journal) : [];
  const details = row ? tripDetailChips(row) : [];
  const manual = row?.source === 'manual';
  const added = row ? formatDayLabelWithYear(row.createdAt) : null;
  if (!row && !watching) return null;
  return (
    <Card testID="trip-about">
      <View style={styles.cardHeader}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.cardEyebrow}>
          {tripAge > 0 ? 'Trip log' : 'This trip'}
        </ThemedText>
        {action}
      </View>
      {(details.length > 0 || facts.length > 0) && (
        <View style={styles.factRow}>
          {facts.map((fact) => (
            <View key={fact} style={[styles.factChip, { backgroundColor: `${theme.warning}1F` }]}>
              <ThemedText type="smallBold" style={[styles.factText, { color: theme.warning }]}>
                {fact}
              </ThemedText>
            </View>
          ))}
          {details.map((detail) => (
            <View key={detail} style={[styles.factChip, { backgroundColor: `${theme.tint}1A` }]}>
              <ThemedText type="smallBold" style={[styles.factText, { color: theme.tint }]}>
                {detail}
              </ThemedText>
            </View>
          ))}
        </View>
      )}
      {summary && <ThemedText type="small">{summary}</ThemedText>}
      {watching && (
        <ThemedText type="small" themeColor="textSecondary">
          {checking
            ? 'Checking the latest status…'
            : "We're watching this flight. If a delay makes you eligible for compensation, you'll know here first."}
        </ThemedText>
      )}
      {row && (
        <View style={styles.provenanceRow}>
          <SymbolView
            name={
              manual
                ? { ios: 'pencil', android: 'edit', web: 'edit' }
                : { ios: 'antenna.radiowaves.left.and.right', android: 'sensors', web: 'sensors' }
            }
            size={13}
            tintColor={theme.textSecondary}
          />
          <ThemedText type="small" themeColor="textSecondary" style={styles.provenanceText}>
            {manual ? `Added by you · ${added}` : `Tracked flight · added ${added}`}
          </ThemedText>
        </View>
      )}
      {tripAge > CLAIM_WINDOW_MS && (
        <ThemedText type="small" themeColor="textSecondary">
          Compensation claim windows (2–6 years depending on country) have likely passed for this trip.
        </ThemedText>
      )}
    </Card>
  );
}

/** Who sees the trip, as a chip. The seat and booking used to sit here
 * too; the ticket card now shows them in every state. */
function tripDetailChips(row: JourneyRow): string[] {
  return [visibilityChip(visibilityOf(row))].filter((chip): chip is string => !!chip);
}

/** The trip journal (A2): photos, the traveller's note and — once flown —
 * the rating. Empty, it is one dashed "Add photos" tile and a field-like
 * row that opens the note; filled, the photo strip, the note in its own
 * panel and the stars. Kept documents sit with it. */
function JournalCard({
  row,
  userId,
  now,
  tripAge,
  flown,
  onEditNotes,
}: {
  row: JourneyRow;
  userId: string | null | undefined;
  now: number;
  tripAge: number;
  flown: boolean;
  onEditNotes: () => void;
}) {
  const theme = useTheme();
  return (
    <Card testID="trip-journal">
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.cardEyebrow}>
        Trip journal
      </ThemedText>
      <View style={styles.journal}>
        <TripPhotos journeyId={row.id} userId={userId} />
        <NotesBlock row={row} now={now} tripAge={tripAge} onEdit={onEditNotes} />
        <TripDocuments journeyId={row.id} />
        {(flown || tripAge > 0) && (
          <View style={[styles.ratingDivider, { borderTopColor: theme.hairline }]}>
            <RatingRow row={row} />
          </View>
        )}
      </View>
    </Card>
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

/** Lines of a note the journal card shows before "Read more". */
const NOTE_LINES = 4;

/** The traveler's notes with their last-edited stamp, or the prompt to write
 * some. A long note expands in place; Edit opens the editor. */
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
  const [expanded, setExpanded] = useState(false);
  // Whether the note runs past the four lines the card shows: measured on a
  // hidden, unclamped copy, since a clamped Text reports only its 4 lines.
  const [fullLines, setFullLines] = useState(0);
  const long = fullLines > NOTE_LINES;
  if (row.notes) {
    // The note reads in place: four lines, then "Read more" opens the rest
    // right here — a paragraph does not need a screen of its own. Edit is
    // its own button; the text stays plain and selectable.
    return (
      <View testID="journal-note" style={[styles.notePanel, { backgroundColor: theme.background, borderColor: theme.hairline }]}>
        <View>
          <ThemedText
            style={[styles.notesText, styles.noteMeasure]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onTextLayout={(e) => setFullLines(e.nativeEvent.lines.length)}>
            {row.notes}
          </ThemedText>
          <ThemedText
            style={styles.notesText}
            selectable
            numberOfLines={expanded ? undefined : NOTE_LINES}
            accessibilityLabel={`Your note: ${row.notes}`}>
            {row.notes}
          </ThemedText>
        </View>
        {long && (
          <Pressable
            testID="journal-note-more"
            accessibilityRole="button"
            hitSlop={Spacing.two}
            onPress={() => {
              tapLight();
              setExpanded((x) => !x);
            }}
            style={({ pressed }) => [styles.noteMore, pressed && { opacity: 0.6 }]}>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              {expanded ? 'Show less' : 'Read more'}
            </ThemedText>
          </Pressable>
        )}
        <View style={styles.noteMeta}>
          <ThemedText type="small" themeColor="textSecondary">
            {row.notesUpdatedAt ? `Note · edited ${editedLabel(row.notesUpdatedAt, new Date(now))}` : 'Note'}
          </ThemedText>
          <Pressable
            testID="journal-note-edit"
            accessibilityRole="button"
            accessibilityLabel="Edit note"
            hitSlop={Spacing.two}
            onPress={onEdit}
            style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              Edit
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }
  const prompt = tripAge > 0 ? 'Write about this trip…' : 'Write a note for this trip…';
  return (
    <Pressable
      testID="journal-add-note"
      accessibilityRole="button"
      accessibilityLabel={prompt.replace('…', '')}
      onPress={onEdit}
      style={({ pressed }) => [styles.noteField, { backgroundColor: theme.background, borderColor: theme.hairline }, pressed && { opacity: 0.6 }]}>
      <SymbolView
        name={{ ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note' }}
        size={16}
        tintColor={theme.textSecondary}
      />
      <ThemedText themeColor="textSecondary">{prompt}</ThemedText>
    </Pressable>
  );
}

/** `embedded`: the trip is the detail pane beside the Flights list, not a
 * pushed route — the list drops the row and the pane falls back to its
 * default pick, and there is no screen of its own to go back from. */
function confirmRemove(journeyId: string, router: ReturnType<typeof useRouter>, embedded: boolean) {
  Alert.alert('Remove this trip?', 'It will disappear from your travel history.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Remove',
      style: 'destructive',
      onPress: async () => {
        await deleteJourney(journeyId);
        if (!embedded) router.back();
      },
    },
  ]);
}

/** Native "···" menu: Edit (journal entries only), "Who sees this trip"
 * (null when there's no circle feature to keep a trip from — it opens the
 * three-way chooser), then destructive Remove. Changing the audience needs
 * no confirmation — the trip card says so at once, and the same menu undoes it. */
function showTripMenu(
  journeyId: string,
  editable: boolean,
  changeAudience: (() => void) | null,
  router: ReturnType<typeof useRouter>,
  embedded: boolean,
) {
  const items: { text: string; onPress: () => void; destructive?: boolean }[] = [];
  if (editable) {
    items.push({
      text: 'Edit trip details',
      onPress: () => router.push({ pathname: '/add-details', params: { editId: journeyId } }),
    });
  }
  if (changeAudience) {
    items.push({ text: 'Who sees this trip…', onPress: changeAudience });
  }
  items.push({
    text: 'Remove from Flights',
    onPress: () => confirmRemove(journeyId, router, embedded),
    destructive: true,
  });

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...items.map((i) => i.text), 'Cancel'],
        destructiveButtonIndex: items.findIndex((i) => i.destructive),
        cancelButtonIndex: items.length,
      },
      (index) => items[index]?.onPress(),
    );
    return;
  }

  Alert.alert('Trip options', undefined, [
    ...items.map((i) => ({
      text: i.text,
      onPress: i.onPress,
      ...(i.destructive ? { style: 'destructive' as const } : {}),
    })),
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

// One success buzz per journey per app session — the verdict is a thrill the
// first time it appears, a fact every time after.
const celebratedJourneys = new Set<string>();

function VerdictCard({ journey, disruption }: { journey: Journey; disruption: Disruption }) {
  const router = useRouter();
  const theme = useTheme();
  const verdict = evaluate(journey, disruption);
  // Never set for the demo journey — there's no DB row to claim against.
  const { row: claim, loaded: claimLoaded } = useClaimForJourney(journey.id);
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
    if (isDemoJourneyId(journey.id) || (await hasPro())) {
      router.push({ pathname: '/claim', params: { journeyId: journey.id, delay } });
      return;
    }
    // `next` lets the paywall continue straight into the claim wizard after an
    // unlock instead of bouncing back here for a second tap.
    router.push({
      pathname: '/pro-offer',
      params: { feature: 'claim', journeyId: journey.id, next: `/claim?journeyId=${encodeURIComponent(journey.id)}&delay=${delay}` },
    });
  };

  return (
    <Animated.View entering={FadeInUp.duration(400)}>
    <Card style={verdict.eligible ? styles.verdictCard : undefined}>
      {verdict.eligible && verdict.compensation ? (
        <>
          <SheenSweep />
          <ThemedText style={[styles.owedTitle, { color: theme.success }]}>
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
          ) : claimLoaded ? (
            <View style={styles.cta}>
              <PrimaryButton
                label={claim ? 'Finish my claim →' : 'Generate my claim →'}
                onPress={startClaim}
              />
            </View>
          ) : null}
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
  owedTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
  },
  slot: {
    gap: Spacing.three,
  },
  earning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderTopWidth: 1,
  },
  earningText: {
    flex: 1,
  },
  ratingDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  notePanel: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
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
  noteMeasure: {
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0,
  },
  noteMore: {
    alignSelf: 'flex-start',
    marginTop: -Spacing.one,
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
