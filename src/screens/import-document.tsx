import { useAuth } from '@clerk/expo';
import { useQueries } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { Observe } from 'expo-observe';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AirlineLogo } from '@/components/airline-logo';
import {
  MicroLabel,
  PassAction,
  PassCard,
  PassDivider,
  PassRouteRow,
  PASS_AMBER,
} from '@/components/pass-card';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { COBALT, WHITE, WHITE_DIM } from '@/components/travel-stats-header';
import { CARRIERS, carrierFor } from '@/constants/carriers';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getAirport } from '@/services/airports';
import { trackEvent } from '@/services/analytics';
import { formatDayLabel, formatDayLabelWithYear, formatTime, localDateString } from '@/services/dates';
import { recordDelay } from '@/services/disruptions';
import { FlightLookupError, lookupFlight, type FlightStatus } from '@/services/flight-lookup';
import { haversineKm } from '@/services/geo';
import { extractItinerary, type ImportedSegment } from '@/services/itinerary';
import { addJourney, useJourneys, type NewJourneyRow } from '@/services/journeys';
import { reconcileNotifications } from '@/services/notification-lifecycle';
import { requestPushPermission } from '@/services/notifications';
import { readPdf } from '../../modules/flyright-document-import';

/**
 * "Share → FlyRight" lands here with a PDF: a boarding pass, an e-ticket
 * receipt, a booking confirmation. The native reader hands over each page's
 * text and barcodes, the pure extractor turns that into legs, and every leg
 * with a flight number and a date is looked up so the cards show the same
 * live facts add-flight would. One tap saves them all: lookup rows where the
 * provider knows the flight, journal rows (route and times as printed) where
 * it doesn't, and a "fill in the route" hand-off for the rare leg the
 * document names but never spells out.
 */

type Phase =
  | { kind: 'reading' }
  | { kind: 'unreadable'; message: string }
  | { kind: 'review'; segments: ImportedSegment[]; barcodes: number }
  | { kind: 'saving'; segments: ImportedSegment[]; barcodes: number }
  | { kind: 'added'; count: number; tracked: number };

/** The provider remembers about a year back and schedules run ~11 months
 * ahead; outside that a lookup is a guaranteed 404, so skip the round trip. */
function withinLookupReach(date: string, today: Date): boolean {
  const day = new Date(`${date}T12:00:00`);
  const past = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const future = new Date(today.getFullYear(), today.getMonth() + 11, today.getDate());
  return day >= past && day <= future;
}

/** Gate-to-gate estimate when the document printed no arrival time — the
 * same rule of thumb the manual add-flight form uses. */
function estimatedArrival(depClock: string, distanceKm: number): string {
  const airborne = (distanceKm / 850) * 60;
  const minutes = Math.round((airborne + 40) / 5) * 5;
  const [h, m] = depClock.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${`${Math.floor(total / 60)}`.padStart(2, '0')}:${`${total % 60}`.padStart(2, '0')}`;
}

function fileLabel(uri: string | null, name: string | undefined): string {
  if (name) return name;
  if (!uri) return 'document';
  const last = uri.split('/').pop() ?? 'document';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** What saving a segment would write, given whatever the lookup returned. */
type Plan =
  | { kind: 'lookup'; flight: FlightStatus }
  | { kind: 'journal'; from: string; to: string }
  | { kind: 'incomplete' }
  | { kind: 'pending' };

/** The operating airline named by the document, with its country when the
 * carrier table knows it — null when the document names none or it is the
 * marketing carrier itself. */
function operatorOf(segment: ImportedSegment): { code: string | null; name: string; country: string | null } | null {
  const op = segment.operatedBy;
  if (!op) return null;
  const marketing = segment.flight ? carrierFor(segment.flight).iata : null;
  if (op.code && op.code === marketing) return null;
  return { code: op.code, name: op.name, country: op.code ? CARRIERS[op.code]?.country ?? null : null };
}

function planFor(segment: ImportedSegment, lookup: { data?: FlightStatus; isPending: boolean } | null): Plan {
  if (lookup?.isPending) return { kind: 'pending' };
  if (lookup?.data?.from.code && lookup.data.to.code) return { kind: 'lookup', flight: lookup.data };
  if (segment.fromCode && segment.toCode && getAirport(segment.fromCode) && getAirport(segment.toCode)) {
    return { kind: 'journal', from: segment.fromCode, to: segment.toCode };
  }
  return { kind: 'incomplete' };
}

export function ImportDocument() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { userId, isSignedIn } = useAuth();
  const { uri, name } = useLocalSearchParams<{ uri?: string; name?: string }>();
  const fileUri = uri ?? null;
  const label = fileLabel(fileUri, name || undefined);
  const { data: journeys } = useJourneys(userId);

  const [phase, setPhase] = useState<Phase>(() =>
    fileUri ? { kind: 'reading' } : { kind: 'unreadable', message: 'No document was shared.' },
  );
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const today = useMemo(() => new Date(), []);

  // Read once per file. The copy is ours (Inbox on iOS, cache on Android) and
  // deleted as soon as it has been parsed — the app never keeps the PDF.
  useEffect(() => {
    if (!fileUri) return;
    let cancelled = false;
    (async () => {
      try {
        const contents = await readPdf(fileUri);
        const { segments, boardingPassBarcodes } = extractItinerary(contents.pages, today);
        if (cancelled) return;
        setPhase({ kind: 'review', segments, barcodes: boardingPassBarcodes });
        trackEvent('document_shared', {
          flights: segments.length,
          barcodes: boardingPassBarcodes,
          pages: contents.pageCount,
        });
        Observe.logEvent('document.imported', {
          attributes: { flights: segments.length, barcodes: boardingPassBarcodes, pages: contents.pageCount },
        });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'This file could not be read.';
        setPhase({ kind: 'unreadable', message });
        Observe.logEvent('document.unreadable', { severity: 'warn', body: message });
      } finally {
        try {
          new File(fileUri).delete();
        } catch {
          // A missing or already-removed file is fine.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUri, today]);

  const segments = phase.kind === 'review' || phase.kind === 'saving' ? phase.segments : [];

  // Live lookups are per-account; signed out, every leg is saved from the
  // document alone and the header says how to get tracking.
  const lookupAllowed = !!isSignedIn;
  const lookups = useQueries({
    queries: segments.map((s) => ({
      queryKey: ['flight-status', s.flight, s.date],
      queryFn: () => lookupFlight(s.flight!, s.date!),
      enabled: lookupAllowed && !!s.flight && !!s.date && withinLookupReach(s.date, today),
      retry: false,
    })),
  });

  // Legs already in the journal: matched by the lookup row id or by number
  // and day, so a receipt re-shared after the trip doesn't duplicate anything.
  const existing = useMemo(() => {
    const ids = new Set<string>();
    for (const j of journeys ?? []) {
      ids.add(j.id);
      if (j.number) ids.add(`${j.number}-${j.scheduledDeparture.slice(0, 10)}`);
    }
    return ids;
  }, [journeys]);

  const rows = segments.map((segment, i) => {
    const query = lookups[i];
    // A lookup that never ran (out of reach) is "not pending" with no data.
    const plan = planFor(segment, query.fetchStatus === 'idle' && !query.data ? null : query);
    const already = !!segment.flight && !!segment.date && existing.has(`${segment.flight}-${segment.date}`);
    const selectable = !already && (plan.kind === 'lookup' || plan.kind === 'journal');
    const selected = selectable && !deselected.has(segment.key);
    return {
      segment,
      plan,
      already,
      selectable,
      selected,
      error: lookupAllowed ? query.error : new FlightLookupError('Sign in to look flights up live.', 401),
    };
  });

  const selectedRows = rows.filter((r) => r.selected);
  const pendingCount = rows.filter((r) => r.plan.kind === 'pending').length;

  const toggle = (key: string) =>
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = async () => {
    if (!selectedRows.length) return;
    setPhase((current) => (current.kind === 'review' ? { ...current, kind: 'saving' } : current));
    let tracked = 0;
    const now = new Date().toISOString();
    for (const { segment, plan } of selectedRows) {
      const details = { bookingReference: segment.pnr, seat: segment.seat };
      // A codeshare leg is stored as the airline flying it — EU261's carrier
      // test is about the operator — under the number on the ticket.
      const operator = operatorOf(segment);
      if (plan.kind === 'lookup') {
        const flight = plan.flight;
        const row: NewJourneyRow = {
          id: `${flight.flight}-${flight.date}`,
          userId,
          mode: 'flight',
          source: 'lookup',
          carrier: operator?.name ?? flight.carrier.name,
          carrierCountry: operator?.country ?? flight.carrierCountry,
          number: flight.flight,
          fromCode: flight.from.code!,
          fromCountry: flight.from.country ?? '',
          toCode: flight.to.code!,
          toCountry: flight.to.country ?? '',
          distanceKm: flight.distanceKm ?? 0,
          scheduledDeparture: flight.scheduledDeparture ?? `${flight.date}T00:00:00Z`,
          scheduledArrival: flight.scheduledArrival ?? `${flight.date}T00:00:00Z`,
          ...details,
          createdAt: now,
        };
        await addJourney(row);
        if (flight.delayMinutes != null) await recordDelay(row.id, flight.delayMinutes);
        if (!flight.landed) tracked += 1;
        trackEvent('flight_added', { source: 'lookup', via: 'document' });
      } else if (plan.kind === 'journal' && segment.date) {
        const from = getAirport(plan.from)!;
        const to = getAirport(plan.to)!;
        const distanceKm = haversineKm(from.lat, from.lon, to.lat, to.lon);
        const depClock = segment.depTime ?? '12:00';
        const arrClock = segment.arrTime ?? (segment.depTime ? estimatedArrival(depClock, distanceKm) : depClock);
        const arrivalDay =
          segment.arrivalDate ??
          (arrClock < depClock ? localDateString(new Date(`${segment.date}T12:00:00`), 1) : segment.date);
        const carrier = operator ?? (segment.flight ? carrierFor(segment.flight) : null);
        await addJourney({
          id: `${segment.flight ?? 'TRIP'}-${from.iata}-${to.iata}-${segment.date}`,
          userId,
          mode: 'flight',
          source: 'manual',
          carrier: carrier?.name ?? 'Flight',
          carrierCountry: carrier?.country ?? '',
          number: segment.flight ?? '',
          fromCode: from.iata,
          fromCountry: from.country,
          toCode: to.iata,
          toCountry: to.country,
          distanceKm,
          scheduledDeparture: `${segment.date}T${depClock}:00`,
          scheduledArrival: `${arrivalDay}T${arrClock}:00`,
          ...details,
          createdAt: now,
        });
        trackEvent('flight_added', { source: 'manual', via: 'document' });
      }
    }
    setPhase({ kind: 'added', count: selectedRows.length, tracked });
    Observe.logEvent('document.flights_added', {
      attributes: { count: selectedRows.length, tracked },
    });
    // Same moment as add-flight's "Track this flight": they trusted us with
    // upcoming trips, so ask for push once (a no-op after the first answer).
    if (tracked > 0) {
      requestPushPermission()
        .then(() => reconcileNotifications())
        .catch(() => {});
    }
  };

  /** The rare leg with a number but no recognisable route: hand it to the
   * manual form with everything the document did say already filled in. */
  const completeManually = (segment: ImportedSegment) => {
    router.push({
      pathname: '/add-flight',
      params: {
        flight: segment.flight ?? '',
        date: segment.date ?? '',
        from: segment.fromCode ?? '',
        to: segment.toCode ?? '',
        pnr: segment.pnr ?? '',
        seat: segment.seat ?? '',
        depTime: segment.depTime ?? '',
        arrTime: segment.arrTime ?? '',
        manual: '1',
      },
    });
  };

  // Let the check-mark land, then hand back to the journeys list.
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (phase.kind !== 'added') return;
    dismissTimer.current = setTimeout(() => router.back(), 1800);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [phase.kind, router]);

  const containerStyle = [styles.container, { paddingTop: Math.max(insets.top, Spacing.four) }];

  if (phase.kind === 'added') {
    const { count, tracked } = phase;
    return (
      <ThemedView style={[...containerStyle, styles.centered]} testID="import-added">
        <Animated.View entering={ZoomIn.springify()} style={styles.addedBadge}>
          <View style={[styles.addedCircle, { backgroundColor: theme.success }]}>
            <SymbolView
              name={{ ios: 'checkmark', android: 'check', web: 'check' }}
              size={40}
              tintColor="#FFFFFF"
            />
          </View>
          <ThemedText type="subtitle" themeColor="heading">
            {count === 1 ? 'Flight added' : `${count} flights added`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.addedSub}>
            {tracked > 0
              ? "They're in My travels — we'll watch the upcoming ones for delays and anything you're owed."
              : "They're in My travels. If a flight was disrupted, its verdict is waiting on the trip page."}
          </ThemedText>
        </Animated.View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={containerStyle} testID="import-document">
      <View style={styles.header}>
        <ThemedText type="subtitle" themeColor="heading">
          Add from document
        </ThemedText>
        <Pressable accessibilityLabel="Close" hitSlop={Spacing.three} onPress={() => router.back()}>
          <ThemedText themeColor="textSecondary" style={styles.close}>
            ✕
          </ThemedText>
        </Pressable>
      </View>

      {phase.kind === 'reading' && (
        <PassCard style={styles.loadingCard}>
          <ActivityIndicator color={WHITE} />
          <ThemedText type="small" style={styles.passHint} numberOfLines={2}>
            Reading {label}…
          </ThemedText>
        </PassCard>
      )}

      {phase.kind === 'unreadable' && (
        <View style={styles.rowGroup}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">We couldn&apos;t read that file</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {phase.message}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Share a PDF boarding pass, e-ticket receipt or booking confirmation — or add the
              flight by number.
            </ThemedText>
          </ThemedView>
          <PrimaryButton label="Add a flight by number →" onPress={() => router.replace('/add-flight')} />
        </View>
      )}

      {phase.kind === 'review' && segments.length === 0 && (
        <View style={styles.rowGroup}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">No flights found in {label}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              We look for flight numbers, dates and boarding-pass barcodes. Scanned images and
              hotel or car bookings don&apos;t carry those — try the airline&apos;s e-ticket or
              confirmation PDF.
            </ThemedText>
          </ThemedView>
          <PrimaryButton label="Add a flight by number →" onPress={() => router.replace('/add-flight')} />
        </View>
      )}

      {(phase.kind === 'review' || phase.kind === 'saving') && segments.length > 0 && (
        <>
          <ThemedText themeColor="textSecondary" numberOfLines={2}>
            {segments.length === 1 ? 'One flight' : `${segments.length} flights`} in {label}
            {phase.barcodes > 0
              ? ` · ${phase.barcodes === 1 ? 'one boarding pass' : `${phase.barcodes} boarding passes`} read`
              : ''}
          </ThemedText>
          {!lookupAllowed && (
            <Pressable onPress={() => router.push('/sign-in')} hitSlop={Spacing.two}>
              <ThemedText type="small" themeColor="textSecondary">
                Saved as journal entries.{' '}
                <ThemedText type="small" themeColor="tint">
                  Sign in to track them live →
                </ThemedText>
              </ThemedText>
            </Pressable>
          )}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}>
            {rows.map(({ segment, plan, already, selectable, selected, error }) => (
              <SegmentCard
                key={segment.key}
                segment={segment}
                plan={plan}
                already={already}
                selectable={selectable}
                selected={selected}
                lookupError={error}
                onToggle={() => toggle(segment.key)}
                onComplete={() => completeManually(segment)}
              />
            ))}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
            <PrimaryButton
              label={
                phase.kind === 'saving'
                  ? 'Adding…'
                  : selectedRows.length === 0
                    ? pendingCount > 0
                      ? 'Looking up flights…'
                      : 'Nothing selected'
                    : selectedRows.length === 1
                      ? 'Add 1 flight to My travels →'
                      : `Add ${selectedRows.length} flights to My travels →`
              }
              disabled={phase.kind === 'saving' || selectedRows.length === 0}
              onPress={save}
            />
          </View>
        </>
      )}
    </ThemedView>
  );
}

/** One leg as a boarding-pass card with a selection ring. The route row shows
 * the provider's codes and times when the lookup landed, the document's
 * otherwise; the status line says which kind of row a tap would create. */
function SegmentCard({
  segment,
  plan,
  already,
  selectable,
  selected,
  lookupError,
  onToggle,
  onComplete,
}: {
  segment: ImportedSegment;
  plan: Plan;
  already: boolean;
  selectable: boolean;
  selected: boolean;
  lookupError: unknown;
  onToggle: () => void;
  onComplete: () => void;
}) {
  const flight = plan.kind === 'lookup' ? plan.flight : null;
  const fromCode = flight?.from.code ?? segment.fromCode;
  const toCode = flight?.to.code ?? segment.toCode;
  const depTime = flight?.scheduledDeparture
    ? formatTime(flight.scheduledDeparture)
    : segment.depTime && segment.date
      ? formatTime(`${segment.date}T${segment.depTime}:00`)
      : null;
  const arrTime = flight?.scheduledArrival
    ? formatTime(flight.scheduledArrival)
    : segment.arrTime && segment.arrivalDate
      ? formatTime(`${segment.arrivalDate}T${segment.arrTime}:00`)
      : null;
  const date = flight?.date ?? segment.date;
  const thisYear = date ? date.slice(0, 4) === `${new Date().getFullYear()}` : true;
  const carrier = segment.flight ? carrierFor(segment.flight) : null;
  const operator = operatorOf(segment);
  const marketingName = flight?.carrier.name ?? carrier?.name ?? 'Flight';
  const carrierName = operator?.name ?? marketingName;

  const status = (() => {
    if (already) return { text: 'Already in My travels', color: WHITE_DIM };
    if (plan.kind === 'pending') return { text: 'Looking up…', color: WHITE_DIM };
    if (plan.kind === 'lookup') {
      const f = plan.flight;
      if (f.landed) {
        return f.delayMinutes != null && f.delayMinutes > 0
          ? { text: `Arrived ${f.delayMinutes} min late — a verdict is waiting`, color: PASS_AMBER }
          : { text: 'Arrived on time', color: '#2FD68C' };
      }
      return { text: "Scheduled — we'll watch it for delays", color: WHITE_DIM };
    }
    if (plan.kind === 'journal') {
      // 404: the provider has no such flight. Any other failure (502, offline)
      // is the lookup's problem, not the flight's. No error at all means the
      // date was outside the provider's reach and the lookup never ran.
      const why =
        lookupError instanceof FlightLookupError && lookupError.signInRequired
          ? 'Sign in for live tracking'
          : lookupError instanceof FlightLookupError && lookupError.quotaExceeded
            ? "Today's live lookups are used up"
            : lookupError instanceof FlightLookupError && lookupError.status === 404
              ? 'No live record for this flight'
              : lookupError
                ? 'Live lookup unavailable right now'
                : 'Outside live lookup';
      return { text: `${why} — saved as a journal entry, times as printed`, color: WHITE_DIM };
    }
    return { text: 'Route not recognised — add the airports to save it', color: PASS_AMBER };
  })();

  const details = [
    operator && `Codeshare · sold as ${marketingName}`,
    segment.seat && `Seat ${segment.seat}`,
    segment.pnr && `Booking ${segment.pnr}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: !selectable }}
      accessibilityLabel={`${carrierName} ${segment.flight ?? ''} ${fromCode ?? ''} to ${toCode ?? ''}`}
      disabled={!selectable}
      onPress={onToggle}
      style={{ opacity: selectable || already ? 1 : 0.92 }}>
      <PassCard style={selected ? undefined : styles.unselectedCard} testID={`import-segment-${segment.key}`}>
        <View style={styles.passHeader}>
          <View style={styles.passHeaderLeft}>
            <AirlineLogo number={segment.flight ?? ''} carrier={carrierName} size={32} />
            <MicroLabel>
              {date ? (thisYear ? formatDayLabel(date) : formatDayLabelWithYear(date)) : 'Date unknown'}
            </MicroLabel>
          </View>
          {selectable ? (
            <SymbolView
              name={
                selected
                  ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }
                  : { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' }
              }
              size={26}
              tintColor={selected ? '#2FD68C' : WHITE_DIM}
            />
          ) : already ? (
            <SymbolView
              name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }}
              size={24}
              tintColor={COBALT}
            />
          ) : null}
        </View>
        {fromCode && toCode ? (
          <PassRouteRow
            fromCode={fromCode}
            toCode={toCode}
            depTime={depTime}
            arrTime={arrTime}
            delayed={!!flight && !flight.landed && (flight.delayMinutes ?? 0) > 0}
          />
        ) : (
          <ThemedText type="small" style={styles.passHint}>
            {fromCode ? `From ${fromCode}` : toCode ? `To ${toCode}` : 'Route not in the document'}
            {depTime ? ` · departs ${depTime}` : ''}
          </ThemedText>
        )}
        <View style={styles.passMeta}>
          <ThemedText type="small" style={styles.passCarrier} numberOfLines={1}>
            {carrierName}
            {segment.flight ? ` ${segment.flight}` : ''}
          </ThemedText>
          <ThemedText type="small" style={{ color: status.color }}>
            {status.text}
          </ThemedText>
          {!!details && (
            <ThemedText type="small" style={styles.passCarrier} numberOfLines={1}>
              {details}
            </ThemedText>
          )}
        </View>
        {plan.kind === 'incomplete' && !already && (
          <>
            <PassDivider />
            <PassAction label="Add the route →" onPress={onComplete} />
          </>
        )}
      </PassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  close: {
    fontSize: 20,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  footer: {
    paddingTop: Spacing.two,
  },
  rowGroup: {
    gap: Spacing.two,
  },
  card: {
    gap: Spacing.two,
    borderRadius: Spacing.four,
    padding: Spacing.four,
  },
  loadingCard: {
    alignItems: 'center',
    paddingVertical: Spacing.five,
  },
  unselectedCard: {
    opacity: 0.7,
  },
  passHint: {
    color: WHITE_DIM,
  },
  passHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  passHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  passMeta: {
    gap: Spacing.half,
  },
  passCarrier: {
    color: COBALT,
  },
  addedBadge: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  addedCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
    shadowColor: '#0FA362',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  addedSub: {
    textAlign: 'center',
    maxWidth: 300,
  },
});
