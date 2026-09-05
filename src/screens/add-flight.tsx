import { useAuth } from '@clerk/expo';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useQuery } from '@tanstack/react-query';
import { Observe } from 'expo-observe';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AirlineLogo } from '@/components/airline-logo';
import { BoardingPassScanner } from '@/components/boarding-pass-scanner';
import { CalendarMonth } from '@/components/calendar-month';
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
import { COBALT, WHITE, WHITE_DIM, WHITE_FAINT } from '@/components/travel-stats-header';
import { carrierFor } from '@/constants/carriers';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getAirport, searchAirports, type Airport } from '@/services/airports';
import { trackEvent } from '@/services/analytics';
import { resolveFlightDate, type BoardingPass } from '@/services/bcbp';
import {
  formatDayLabel,
  formatDayLabelWithYear,
  formatTime,
  localDateString,
} from '@/services/dates';
import { haversineKm } from '@/services/geo';
import { reconcileNotifications } from '@/services/notification-lifecycle';
import { requestPushPermission } from '@/services/notifications';
import {
  FlightLookupError,
  lookupFlight,
  normalizeFlightNumber,
} from '@/services/flight-lookup';
import { recordDelay } from '@/services/disruptions';
import { addJourney, updateJourney, useJourney } from '@/services/journeys';
import {
  LibraryPermissionError,
  promptForTravelDocument,
} from '@/services/travel-documents';
import { canImportDocuments } from '../../modules/flyright-document-import';

// Progressive token entry: each confirmed value becomes a chip and the screen
// moves to the next step. Tapping a chip reopens that step.
// 'manual' is the journal path: any trip, any year, no lookup involved.
type Step = 'flight' | 'date' | 'manual' | 'result' | 'added';

const DEFAULT_DEPARTURE_CLOCK = '12:00';

/** Gate-to-gate estimate for the default arrival: ~850 km/h cruise plus
 * taxi/climb overhead, rounded to 5 min so the prefilled time looks intentional. */
function estimatedFlightMinutes(distanceKm: number): number {
  const airborne = (distanceKm / 850) * 60;
  return Math.round((airborne + 40) / 5) * 5;
}

/** 'HH:mm' plus minutes, wrapping past midnight (the save path bumps the day). */
function addClockMinutes(clock: string, minutes: number): string {
  const [h, m] = clock.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${`${Math.floor(total / 60)}`.padStart(2, '0')}:${`${total % 60}`.padStart(2, '0')}`;
}

const PROMPTS: Record<Step, string> = {
  flight: 'Enter your flight number',
  date: 'Enter the departure date',
  manual: 'Where did the flight take you?',
  result: 'Is this your flight?',
  added: '',
};

/** The optional booking reference and seat as row fields: trimmed, upper-
 * cased, null when blank. */
function tripDetails(bookingRef: string, seat: string) {
  const ref = bookingRef.trim().toUpperCase();
  const seatNo = seat.trim().toUpperCase();
  return { bookingReference: ref || null, seat: seatNo || null };
}

export function AddFlight() {
  const router = useRouter();
  const theme = useTheme();
  // Full-screen modal, so the status bar is ours to clear. Explicit insets,
  // not SafeAreaView — inside a fullScreenModal the native SafeAreaView can
  // resolve its top inset as 0 on iOS (same workaround as onboarding).
  const insets = useSafeAreaInsets();
  const { userId, isSignedIn } = useAuth();
  // Edit mode: the journey detail screen reopens this sheet with ?editId=<id>
  // for a manual entry, prefilled below. The row id stays stable across the
  // save so claims/disruptions references and the cloud sync key survive.
  const { editId, ...prefill } = useLocalSearchParams<{
    editId?: string;
    // Prefill from the document import ("Add the route →" on a leg whose
    // airports the PDF never spelled out): whatever the document did say.
    flight?: string;
    date?: string;
    from?: string;
    to?: string;
    pnr?: string;
    seat?: string;
    depTime?: string;
    arrTime?: string;
    /** '1' to open straight on the journal form instead of the lookup. */
    manual?: string;
  }>();
  const editRow = useJourney(editId ?? '', userId);

  const [step, setStep] = useState<Step>('flight');
  const [flightInput, setFlightInput] = useState('');
  const [flightNumber, setFlightNumber] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  // Calendar picks are staged behind an explicit confirm — a mis-tap on a day
  // cell shouldn't commit a decades-back journal date and jump the step.
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  // Journal path: entered via "add manually" (no flight number, or lookup failed).
  const [manualMode, setManualMode] = useState(false);
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [activeField, setActiveField] = useState<'from' | 'to'>('from');
  // Optional 'HH:mm' times for journal entries; null keeps the noon placeholder.
  const [depTime, setDepTime] = useState<string | null>(null);
  const [arrTime, setArrTime] = useState<string | null>(null);
  const [timePickerFor, setTimePickerFor] = useState<'dep' | 'arr' | null>(null);
  // Booking reference (PNR) and seat: typed on the journal form or read off
  // a scanned boarding pass, saved with either path.
  const [bookingRef, setBookingRef] = useState('');
  const [seat, setSeat] = useState('');
  // Boarding-pass scanner open on the flight step (native only — web camera
  // barcode support is too patchy to offer).
  const [scanning, setScanning] = useState(false);

  const inputCandidate = normalizeFlightNumber(flightInput);
  const today = new Date();

  // Prefill once from the row being edited, then jump straight to the manual
  // form (the guarded set-state-during-render pattern — the row arrives async
  // from the live query). Only manual entries are editable — lookup rows
  // mirror the provider.
  const [prefilled, setPrefilled] = useState(false);
  if (!editId && !prefilled && (prefill.flight || prefill.date || prefill.from)) {
    setPrefilled(true);
    const designator = prefill.flight ? normalizeFlightNumber(prefill.flight) : null;
    if (designator) {
      setFlightInput(designator);
      setFlightNumber(designator);
    }
    if (prefill.date) setDate(prefill.date);
    if (prefill.from) setFromInput(prefill.from);
    if (prefill.to) setToInput(prefill.to);
    if (prefill.pnr) setBookingRef(prefill.pnr);
    if (prefill.seat) setSeat(prefill.seat);
    if (prefill.depTime) setDepTime(prefill.depTime);
    if (prefill.arrTime) setArrTime(prefill.arrTime);
    const manual = prefill.manual === '1' || !designator;
    setManualMode(manual);
    setStep(!prefill.date ? 'date' : manual ? 'manual' : 'result');
  }
  if (editId && editRow && !prefilled) {
    setPrefilled(true);
    setManualMode(true);
    setFromInput(editRow.fromCode);
    setToInput(editRow.toCode);
    setDate(editRow.scheduledDeparture.slice(0, 10));
    if (editRow.number) setFlightNumber(editRow.number);
    setBookingRef(editRow.bookingReference ?? '');
    setSeat(editRow.seat ?? '');
    // Identical noon timestamps are the "no times entered" placeholder.
    const dep = editRow.scheduledDeparture;
    const arr = editRow.scheduledArrival;
    if (!(dep === arr && dep.endsWith('T12:00:00'))) {
      setDepTime(dep.slice(11, 16));
      if (arr !== dep) setArrTime(arr.slice(11, 16));
    }
    setStep('manual');
  }

  const confirmFlight = () => {
    if (!inputCandidate) return;
    setFlightNumber(inputCandidate);
    if (editId) {
      // Edits never re-enter the lookup flow — back to the manual form.
      setStep('manual');
      return;
    }
    setManualMode(false);
    setStep('date');
  };

  const startManual = () => {
    setManualMode(true);
    setStep(date ? 'manual' : 'date');
  };

  // One scan fills every token at once: flight, date, and the route — the
  // route so that when the lookup 404s (old pass, regional carrier), the
  // manual fallback comes prefilled instead of empty.
  const applyScan = (pass: BoardingPass) => {
    const leg = pass.legs[0];
    const designator = normalizeFlightNumber(leg.flight);
    setScanning(false);
    setFlightInput(leg.flight);
    setFlightNumber(designator);
    setFromInput(leg.fromCode);
    setToInput(leg.toCode);
    setBookingRef(leg.pnr);
    setSeat(leg.seat ?? '');
    setDate(resolveFlightDate(leg.dayOfYear, today));
    setManualMode(!designator);
    setStep(designator ? 'result' : 'manual');
    Observe.logEvent('flight.scanned', {
      attributes: { legs: pass.legs.length, lookupable: !!designator },
    });
    trackEvent('boarding_pass_scanned', { legs: pass.legs.length, lookupable: !!designator });
  };

  /** The other way in for a pass that isn't in front of the camera: the PDF
   * the airline emailed, or the screenshot of the one on the phone. Reading
   * it is the import screen's job — the same screen a shared document opens
   * — so this hands the file over and steps aside (replace, not push: the
   * form has nothing left to do, and cancelling the import lands back on the
   * journal rather than on a half-filled sheet). */
  const uploadDocument = async () => {
    Keyboard.dismiss();
    setScanning(false);
    try {
      const picked = await promptForTravelDocument();
      if (!picked) return;
      trackEvent('document_upload_picked', { mimeType: picked.mimeType ?? 'unknown' });
      router.replace({
        pathname: '/import-document',
        params: {
          uri: picked.uri,
          name: picked.name ?? '',
          type: picked.mimeType ?? '',
          via: 'upload',
        },
      });
    } catch (error) {
      if (error instanceof LibraryPermissionError) {
        Alert.alert(
          'Photo access is off',
          'FlyRight needs access to your photos to read a pass from your library.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      Alert.alert(
        'That file could not be opened',
        'Please try again, or type the flight number instead.',
      );
    }
  };

  const confirmDate = (day: string) => {
    setDate(day);
    setPendingDate(null);
    setStep(manualMode ? 'manual' : 'result');
  };

  const editFlight = () => {
    setFlightInput(flightNumber ?? '');
    setFlightNumber(null);
    if (editId) {
      // Keep the rest of the edit intact; only the number is being retyped.
      setStep('flight');
      return;
    }
    setDate(null);
    setManualMode(false);
    setStep('flight');
  };

  const editDate = () => {
    // Stage the current date so the calendar reopens on it, pre-selected.
    setPendingDate(date);
    setDate(null);
    setStep('date');
  };

  // Live lookups are per-account (the route meters a paid provider), so the
  // result step asks for sign-in first instead of firing a request that
  // would be refused. The journal path stays open without an account.
  const lookupAllowed = !!isSignedIn;
  const lookup = useQuery({
    queryKey: ['flight-status', flightNumber, date],
    queryFn: () => lookupFlight(flightNumber!, date!),
    enabled: step === 'result' && !!flightNumber && !!date && lookupAllowed,
    retry: false,
  });

  const flight = lookup.data;
  const routeKnown = !!flight?.from.code && !!flight?.to.code;

  // A flight that already landed (or whose arrival is hours behind us) can't
  // be "tracked" — it's journal and verdict material, so the CTA says save.
  // In-progress flights stay trackable: their arrival delay is unwritten.
  const flightPast =
    !!flight &&
    (flight.landed === true ||
      (!!flight.scheduledArrival &&
        Date.parse(flight.scheduledArrival) < today.getTime() - 6 * 3_600_000));

  // Funnel drop-off signal: they typed a flight and we couldn't show it.
  useEffect(() => {
    if (!lookup.error) return;
    Observe.logEvent('flight.lookup_failed', {
      severity: 'warn',
      body: lookup.error.message,
      attributes: { known: lookup.error instanceof FlightLookupError },
    });
  }, [lookup.error]);

  const track = async () => {
    if (!flight || !routeKnown) return;
    await addJourney({
      id: `${flight.flight}-${flight.date}`,
      userId,
      mode: 'flight',
      source: 'lookup',
      carrier: flight.carrier.name,
      carrierCountry: flight.carrierCountry,
      number: flight.flight,
      fromCode: flight.from.code!,
      fromCountry: flight.from.country ?? '',
      toCode: flight.to.code!,
      toCountry: flight.to.country ?? '',
      distanceKm: flight.distanceKm ?? 0,
      scheduledDeparture: flight.scheduledDeparture ?? `${flight.date}T00:00:00Z`,
      scheduledArrival: flight.scheduledArrival ?? `${flight.date}T00:00:00Z`,
      ...tripDetails(bookingRef, seat),
      createdAt: new Date().toISOString(),
    });
    trackEvent('flight_added', { source: 'lookup' });
    // The lookup already knows the arrival delay — cache it so the journeys
    // list can badge an owed row without another status call.
    if (flight.delayMinutes != null) {
      await recordDelay(`${flight.flight}-${flight.date}`, flight.delayMinutes);
    }
    setStep('added');
    Observe.logEvent('flight.tracked', {
      attributes: {
        carrier: flight.carrier.name,
        route: `${flight.from.code}-${flight.to.code}`,
        distanceKm: flight.distanceKm ?? 0,
      },
    });
    // The meaningful moment: they just trusted us with a flight to watch.
    // iOS shows the system dialog once; subsequent calls are no-ops. The
    // reconcile after it schedules this trip's reminder now that (if granted)
    // the permission exists — the earlier addJourney reconcile ran without it.
    requestPushPermission()
      .then(() => reconcileNotifications())
      .catch(() => {});
  };

  const fromAirport = getAirport(fromInput);
  const toAirport = getAirport(toInput);

  // The time chips come prefilled: noon departure, arrival tracking whatever
  // departure is chosen plus the leg's estimated duration.
  const manualKm =
    fromAirport && toAirport
      ? haversineKm(fromAirport.lat, fromAirport.lon, toAirport.lat, toAirport.lon)
      : null;
  const depClock = depTime ?? DEFAULT_DEPARTURE_CLOCK;
  const arrClock =
    arrTime ??
    (manualKm != null ? addClockMinutes(depClock, estimatedFlightMinutes(manualKm)) : depClock);

  const saveManual = async () => {
    if (!fromAirport || !toAirport || !date) return;
    const carrier = flightNumber ? carrierFor(flightNumber) : null;
    const distanceKm = haversineKm(
      fromAirport.lat,
      fromAirport.lon,
      toAirport.lat,
      toAirport.lon,
    );
    // An arrival clock earlier than departure means the flight landed next day.
    const arrivalDay =
      arrClock < depClock ? localDateString(new Date(`${date}T12:00:00`), 1) : date;

    if (editId) {
      await updateJourney(editId, {
        carrier: carrier?.name ?? 'Flight',
        carrierCountry: carrier?.country ?? '',
        number: flightNumber ?? '',
        fromCode: fromAirport.iata,
        fromCountry: fromAirport.country,
        toCode: toAirport.iata,
        toCountry: toAirport.country,
        distanceKm,
        scheduledDeparture: `${date}T${depClock}:00`,
        scheduledArrival: `${arrivalDay}T${arrClock}:00`,
        ...tripDetails(bookingRef, seat),
      });
      setStep('added');
      Observe.logEvent('flight.edited', {
        attributes: { route: `${fromAirport.iata}-${toAirport.iata}` },
      });
      return;
    }

    await addJourney({
      id: `${flightNumber ?? 'TRIP'}-${fromAirport.iata}-${toAirport.iata}-${date}`,
      userId,
      mode: 'flight',
      source: 'manual',
      carrier: carrier?.name ?? 'Flight',
      carrierCountry: carrier?.country ?? '',
      number: flightNumber ?? '',
      fromCode: fromAirport.iata,
      fromCountry: fromAirport.country,
      toCode: toAirport.iata,
      toCountry: toAirport.country,
      distanceKm,
      scheduledDeparture: `${date}T${depClock}:00`,
      scheduledArrival: `${arrivalDay}T${arrClock}:00`,
      ...tripDetails(bookingRef, seat),
      createdAt: new Date().toISOString(),
    });
    setStep('added');
    trackEvent('flight_added', { source: 'manual' });
    Observe.logEvent('flight.added_manually', {
      attributes: {
        route: `${fromAirport.iata}-${toAirport.iata}`,
        distanceKm,
        hasNumber: !!flightNumber,
      },
    });
    // Journal entries aren't watched, so no push-permission ask here.
  };

  // Let the check-mark land, then hand back to the journeys list.
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (step !== 'added') return;
    dismissTimer.current = setTimeout(() => router.back(), 1600);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [step, router]);

  if (step === 'added') {
    const savedRoute = manualMode
      ? `${fromInput.toUpperCase()} → ${toInput.toUpperCase()}`
      : routeKnown
        ? `${flight!.from.code} → ${flight!.to.code}`
        : null;
    const savedLabel = [savedRoute, flightNumber].filter(Boolean).join(' · ');
    const title = editId
      ? 'Trip updated'
      : manualMode || flightPast
        ? 'Saved to My travels'
        : 'Added to My travels';
    const subtitle = editId
      ? 'Your changes are saved.'
      : manualMode
        ? 'Your journal has the trip covered.'
        : flightPast
          ? 'If the flight was disrupted, your verdict is waiting on the trip page.'
          : "We're watching it — you'll hear about delays, gates, and anything you're owed.";

    return (
      <ThemedView
        style={[
          styles.container,
          { paddingTop: Math.max(insets.top, Spacing.four) },
          styles.addedContainer,
        ]}>
        <Animated.View entering={ZoomIn.springify()} style={styles.addedBadge}>
          <View style={[styles.addedCircle, { backgroundColor: theme.success }]}>
            <SymbolView
              name={{ ios: 'checkmark', android: 'check', web: 'check' }}
              size={40}
              tintColor="#FFFFFF"
            />
          </View>
          <ThemedText type="subtitle" themeColor="heading">
            {title}
          </ThemedText>
          {!!savedLabel && (
            <View style={styles.chip}>
              <SymbolView
                name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
                size={12}
                tintColor={COBALT}
              />
              <ThemedText type="smallBold" style={styles.chipText}>
                {savedLabel}
              </ThemedText>
            </View>
          )}
          <ThemedText type="small" themeColor="textSecondary" style={styles.addedSub}>
            {subtitle}
          </ThemedText>
        </Animated.View>
      </ThemedView>
    );
  }

  return (
    <ThemedView
      style={[styles.container, { paddingTop: Math.max(insets.top, Spacing.four) }]}>
      <View style={styles.header}>
        <ThemedText type="subtitle" themeColor="heading">
          {editId ? 'Edit Trip' : 'Add Flight'}
        </ThemedText>
        <Pressable
          accessibilityLabel="Close"
          hitSlop={Spacing.three}
          onPress={() => router.back()}>
          <ThemedText themeColor="textSecondary" style={styles.close}>
            ✕
          </ThemedText>
        </Pressable>
      </View>
      <ThemedText themeColor="textSecondary">
        {editId && step === 'manual' ? 'Update your trip details' : PROMPTS[step]}
      </ThemedText>

      {/* Confirmed tokens as boarding-pass stubs — tap one to reopen its step. */}
      {(flightNumber || date) && (
        <View style={styles.tokenRow}>
          {flightNumber && (
            <Pressable onPress={editFlight}>
              <View style={styles.chip}>
                <SymbolView
                  name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
                  size={12}
                  tintColor={COBALT}
                />
                <ThemedText type="smallBold" style={styles.chipText}>
                  {flightNumber}
                </ThemedText>
              </View>
            </Pressable>
          )}
          {date && (
            <Pressable onPress={editDate}>
              <View style={styles.chip}>
                <SymbolView
                  name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }}
                  size={12}
                  tintColor={COBALT}
                />
                <ThemedText type="smallBold" style={styles.chipText}>
                  {/* Journal dates can be years back — ambiguity needs the year. */}
                  {date.slice(0, 4) === localDateString(today).slice(0, 4)
                    ? formatDayLabel(date)
                    : formatDayLabelWithYear(date)}
                </ThemedText>
              </View>
            </Pressable>
          )}
        </View>
      )}

      {/* Every step scrolls: the calendar, the manual card with its time
          spinner, and small screens all need the escape hatch. Taps must
          survive an open keyboard so airport suggestions stay one-tap. */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {step === 'flight' && (
          <View style={styles.rowGroup}>
            {/* The blank boarding pass: the flight number gets written onto
                the same night-sky card the travel-day hero renders, so adding
                a flight already looks like the thing you'll travel with. The
                pass's tear-off stub is the step's one loud action: scan while
                the number slot is blank, search once it isn't — no autofocus,
                so the camera path is in plain sight instead of under the
                keyboard. */}
            {!scanning && (
              <PassCard>
                <MicroLabel>Flight number</MicroLabel>
                <TextInput
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={flightInput}
                  onChangeText={setFlightInput}
                  onSubmitEditing={confirmFlight}
                  placeholder="AY1331 or LH873"
                  placeholderTextColor="rgba(242,246,251,0.35)"
                  selectionColor={COBALT}
                  returnKeyType="search"
                  style={styles.passInput}
                />
                {!inputCandidate && (
                  <ThemedText type="small" style={styles.passHint}>
                    The code on your ticket, booking email, or boarding pass.
                  </ThemedText>
                )}
                {inputCandidate ? (
                  <>
                    <PassDivider />
                    <PassAction label="Search this flight →" onPress={confirmFlight} />
                  </>
                ) : (
                  Platform.OS !== 'web' &&
                  !editId && (
                    <>
                      <PassDivider />
                      <PassAction
                        testID="scan-boarding-pass"
                        icon={{
                          ios: 'viewfinder',
                          android: 'qr_code_scanner',
                          web: 'qr_code_scanner',
                        }}
                        label="Scan ticket or boarding pass"
                        onPress={() => {
                          Keyboard.dismiss();
                          setScanning(true);
                        }}
                      />
                      {/* The pass that isn't in front of the camera: the
                          emailed PDF, or the screenshot of the mobile one.
                          Quieter than the stub's one loud action, since the
                          camera is the faster path when the pass is at hand. */}
                      {canImportDocuments && (
                        <Pressable
                          testID="upload-boarding-pass"
                          hitSlop={Spacing.two}
                          onPress={uploadDocument}>
                          <ThemedText
                            type="smallBold"
                            style={[styles.passLink, styles.centered]}>
                            Upload a ticket PDF or screenshot →
                          </ThemedText>
                        </Pressable>
                      )}
                    </>
                  )
                )}
              </PassCard>
            )}

            {scanning && (
              <BoardingPassScanner
                onScan={applyScan}
                onClose={() => setScanning(false)}
                onUpload={canImportDocuments ? uploadDocument : undefined}
              />
            )}

            {!scanning && !editId && (
              <>
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    startManual();
                  }}>
                  <ThemedView type="backgroundElement" style={styles.row}>
                    <View style={styles.rowLabels}>
                      <ThemedText type="smallBold">Add a trip manually</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        No flight number needed — any date, any year
                      </ThemedText>
                    </View>
                    <ThemedText themeColor="tint">→</ThemedText>
                  </ThemedView>
                </Pressable>
                {/* The provider's memory, stated up front instead of at the
                    404: lookups only reach so far in either direction. */}
                <View style={styles.coverageNote}>
                  <SymbolView
                    name={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
                    size={14}
                    tintColor={theme.textSecondary}
                  />
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    style={styles.coverageText}>
                    Flight lookup covers about a year back and 11 months ahead — the
                    journal takes older trips.
                  </ThemedText>
                </View>
              </>
            )}
          </View>
        )}

        {step === 'date' && (
          <View style={styles.rowGroup}>
            {/* Quick picks as one compact chip row — the calendar below is the
                step's real surface, so the shortcuts don't get three tall cards. */}
            <View style={styles.quickDates}>
              {(
                [
                  { label: 'Today', day: localDateString(today) },
                  { label: 'Tomorrow', day: localDateString(today, 1) },
                  { label: 'Yesterday', day: localDateString(today, -1) },
                ] as const
              ).map(({ label, day }) => (
                <Pressable key={label} style={styles.quickDate} onPress={() => confirmDate(day)}>
                  <ThemedView type="backgroundElement" style={styles.quickDateInner}>
                    <ThemedText type="smallBold">{label}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatDayLabel(day).replace(/^\w+, /, '')}
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              ))}
            </View>
            {/* The journal reaches decades back; the lookup provider only
                remembers ~a year, and schedules run ~11 months forward. */}
            <CalendarMonth
              value={pendingDate}
              minDate={
                manualMode
                  ? new Date(today.getFullYear() - 30, today.getMonth(), today.getDate())
                  : new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
              }
              maxDate={new Date(today.getFullYear(), today.getMonth() + 11, today.getDate())}
              onSelect={setPendingDate}
            />
            <PrimaryButton
              label={
                pendingDate ? `Use ${formatDayLabelWithYear(pendingDate)} →` : 'Pick a day above'
              }
              disabled={!pendingDate}
              onPress={() => pendingDate && confirmDate(pendingDate)}
            />
            {/* Lookup mode carries the provider's reach; the journal has none.
                The link flips this same step into journal mode in place. */}
            {!manualMode && !editId && (
              <Pressable onPress={startManual} hitSlop={Spacing.two}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.dateHint}>
                  We can look up flights from about the last 12 months.{' '}
                  <ThemedText type="small" themeColor="tint">
                    Older trip? Journal it instead →
                  </ThemedText>
                </ThemedText>
              </Pressable>
            )}
          </View>
        )}

        {step === 'result' && !lookupAllowed && (
          <PassCard>
            <MicroLabel>Live tracking</MicroLabel>
            <ThemedText type="smallBold" style={styles.passTitle}>
              Sign in to look up {flightNumber} live
            </ThemedText>
            <ThemedText type="small" style={styles.passHint}>
              Live status, gates, delays and what you&apos;re owed come with a free
              account. Without one, the flight still goes in your journal.
            </ThemedText>
            <PassDivider />
            <PassAction
              icon={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }}
              label="Sign in →"
              onPress={() => router.push('/sign-in')}
            />
            <Pressable onPress={startManual} hitSlop={Spacing.two}>
              <ThemedText type="smallBold" style={[styles.passLink, styles.centered]}>
                Save to journal instead →
              </ThemedText>
            </Pressable>
          </PassCard>
        )}

        {step === 'result' && lookupAllowed && lookup.isPending && (
          <PassCard style={styles.loadingCard}>
            <ActivityIndicator color={WHITE} />
            <ThemedText type="small" style={styles.passHint}>
              Looking up {flightNumber}…
            </ThemedText>
          </PassCard>
        )}

        {step === 'result' && lookupAllowed && lookup.isError && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">
              {lookup.error instanceof FlightLookupError
                ? lookup.error.message
                : 'Flight lookup failed — try again.'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {lookup.error instanceof FlightLookupError && lookup.error.quotaExceeded
                ? 'Your daily live lookups reset at midnight UTC — the trip can still go in your journal now.'
                : 'Flight records only reach back about a year — you can still add this trip to your journal.'}
            </ThemedText>
            <Pressable onPress={startManual} hitSlop={Spacing.two}>
              <ThemedText type="link">Add it manually instead →</ThemedText>
            </Pressable>
          </ThemedView>
        )}

        {step === 'manual' && (
          <View style={styles.rowGroup}>
            <View style={styles.airportInputs}>
              <TextInput
                autoFocus
                autoCapitalize="characters"
                autoCorrect={false}
                value={fromInput}
                onChangeText={setFromInput}
                onFocus={() => setActiveField('from')}
                placeholder="From · city or HEL"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  styles.airportInput,
                  { color: theme.text, backgroundColor: theme.field },
                ]}
              />
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                value={toInput}
                onChangeText={setToInput}
                onFocus={() => setActiveField('to')}
                placeholder="To · city or JFK"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  styles.airportInput,
                  { color: theme.text, backgroundColor: theme.field },
                ]}
              />
            </View>

            <AirportSuggestions
              query={activeField === 'from' ? fromInput : toInput}
              onPick={(airport) => {
                if (activeField === 'from') setFromInput(airport.iata);
                else setToInput(airport.iata);
              }}
            />

            {fromAirport && toAirport && (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="small" themeColor="textSecondary">
                  {fromAirport.city} → {toAirport.city}
                  {flightNumber ? ` · ${flightNumber}` : ''}
                </ThemedText>
                <ThemedText type="subtitle" themeColor="heading">
                  {fromAirport.iata} → {toAirport.iata}
                </ThemedText>
                <ThemedText type="small">
                  {haversineKm(
                    fromAirport.lat,
                    fromAirport.lon,
                    toAirport.lat,
                    toAirport.lon,
                  ).toLocaleString()}{' '}
                  km{date ? ` · ${formatDayLabel(date)}` : ''}
                </ThemedText>
                <View style={styles.timesRow}>
                  {(
                    [
                      { field: 'dep', label: 'Departs', clock: depClock },
                      { field: 'arr', label: 'Arrives', clock: arrClock },
                    ] as const
                  ).map(({ field, label, clock }) => (
                    <Pressable
                      key={field}
                      style={styles.timeChip}
                      onPress={() => {
                        Keyboard.dismiss();
                        setTimePickerFor((open) => (open === field ? null : field));
                      }}>
                      <ThemedView
                        type={timePickerFor === field ? 'backgroundSelected' : 'background'}
                        style={styles.timeChipInner}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {label}
                        </ThemedText>
                        <ThemedText type="smallBold" themeColor="tint">
                          {formatTime(`${date}T${clock}:00`)}
                        </ThemedText>
                      </ThemedView>
                    </Pressable>
                  ))}
                </View>
                {timePickerFor && (
                  <DateTimePicker
                    value={
                      new Date(`${date}T${timePickerFor === 'dep' ? depClock : arrClock}:00`)
                    }
                    mode="time"
                    display="spinner"
                    // iOS: compact inline spinner under the chips. Android has
                    // no inline spinner — its "inline" fallback is a full
                    // Material clock face that dwarfs the card, so it gets the
                    // platform's self-contained time dialog instead.
                    presentation={Platform.OS === 'android' ? 'dialog' : 'inline'}
                    accentColor={theme.tint}
                    onDismiss={() => setTimePickerFor(null)}
                    onValueChange={(_event, picked) => {
                      const clock = `${`${picked.getHours()}`.padStart(2, '0')}:${`${picked.getMinutes()}`.padStart(2, '0')}`;
                      if (timePickerFor === 'dep') setDepTime(clock);
                      else setArrTime(clock);
                      // The dialog closes itself on OK — drop the open flag so
                      // the chip doesn't stay highlighted with nothing shown.
                      if (Platform.OS === 'android') setTimePickerFor(null);
                    }}
                  />
                )}
                <View style={styles.detailInputs}>
                  <TextInput
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={8}
                    value={bookingRef}
                    onChangeText={setBookingRef}
                    placeholder="Booking ref"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.input, styles.detailInput, { color: theme.text, backgroundColor: theme.field }]}
                  />
                  <TextInput
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={4}
                    value={seat}
                    onChangeText={setSeat}
                    placeholder="Seat"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.input, styles.detailInput, { color: theme.text, backgroundColor: theme.field }]}
                  />
                </View>
                <View style={styles.cta}>
                  <PrimaryButton
                    label={editId ? 'Save changes →' : 'Add to My travels →'}
                    onPress={saveManual}
                  />
                </View>
              </ThemedView>
            )}
          </View>
        )}

        {step === 'result' && lookupAllowed && flight && (
          <Animated.View entering={ZoomIn.springify().duration(400)}>
            <PassCard>
              {/* Boarding-pass header: the airline's mark left, the day right. */}
              <View style={styles.passHeader}>
                <AirlineLogo number={flight.flight} carrier={flight.carrier.name} size={32} />
                <MicroLabel>{formatDayLabel(flight.date)}</MicroLabel>
              </View>
              {routeKnown ? (
                <>
                  <PassRouteRow
                    fromCode={flight.from.code!}
                    toCode={flight.to.code!}
                    depTime={
                      flight.scheduledDeparture ? formatTime(flight.scheduledDeparture) : null
                    }
                    arrTime={flight.scheduledArrival ? formatTime(flight.scheduledArrival) : null}
                    delayed={!flight.landed && (flight.delayMinutes ?? 0) > 0}
                  />
                  <View style={styles.passMeta}>
                    <ThemedText type="small" style={styles.passCarrier} numberOfLines={1}>
                      {flight.carrier.name} {flight.flight}
                    </ThemedText>
                    <StatusLine
                      status={flight.status}
                      delayMinutes={flight.delayMinutes}
                      landed={flight.landed}
                    />
                  </View>
                  {(bookingRef || seat) && (
                    <ThemedText type="small" style={styles.passCarrier} numberOfLines={1}>
                      {[seat && `Seat ${seat}`, bookingRef && `Booking ${bookingRef}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </ThemedText>
                  )}
                  <PassDivider />
                  <PassAction
                    label={flightPast ? 'Save to My travels →' : 'Track this flight →'}
                    onPress={track}
                  />
                </>
              ) : (
                <ThemedText type="small" style={styles.passHint}>
                  The provider returned no route for this flight — try another day.
                </ThemedText>
              )}
            </PassCard>
          </Animated.View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

/** Up to three airport matches for the active input — tapping one fills in the
 * IATA code. Hidden once the input already resolves to an airport. */
function AirportSuggestions({
  query,
  onPick,
}: {
  query: string;
  onPick: (airport: Airport) => void;
}) {
  const q = query.trim();
  if (q.length < 2 || getAirport(q)) return null;
  // Six, not three: prefix typing ("LA") fans out over many codes, and the
  // step has the vertical room — the body scrolls and nothing renders below
  // the suggestions until an airport resolves.
  const matches = searchAirports(q, 6);
  if (!matches.length) return null;

  return (
    <View style={styles.rowGroup}>
      {matches.map((airport) => (
        <Pressable key={airport.iata} onPress={() => onPick(airport)}>
          <ThemedView type="backgroundElement" style={styles.row}>
            <View>
              <ThemedText type="smallBold">{airport.iata}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {airport.city}, {airport.country}
              </ThemedText>
            </View>
            <ThemedText themeColor="tint">→</ThemedText>
          </ThemedView>
        </Pressable>
      ))}
    </View>
  );
}

/** Money-green when the arrival went well, amber when there's a delay story,
 * dim white otherwise — the pass card's night palette, not the theme's. */
function StatusLine({
  status,
  delayMinutes,
  landed,
}: {
  status: string;
  delayMinutes: number | null;
  landed?: boolean;
}) {
  // "Arrived" is only true once the flight has landed — before that a
  // delayMinutes value is a live prediction, not an arrival delay.
  if (landed) {
    if (delayMinutes != null && delayMinutes > 0) {
      return (
        <ThemedText type="small" style={{ color: PASS_AMBER }}>
          Arrived {delayMinutes} min late
        </ThemedText>
      );
    }
    return (
      <ThemedText type="small" style={{ color: '#2FD68C' }}>
        Arrived on time
      </ThemedText>
    );
  }
  if (delayMinutes != null && delayMinutes > 0) {
    return (
      <ThemedText type="small" style={{ color: PASS_AMBER }}>
        Running {delayMinutes} min late — we&apos;ll watch the final arrival
      </ThemedText>
    );
  }
  return (
    <ThemedText type="small" style={{ color: WHITE_DIM }}>
      {status === 'scheduled' || status === 'Expected'
        ? "Scheduled — we'll watch it for delays"
        : `Status: ${status}`}
    </ThemedText>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  close: {
    fontSize: 20,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  // Confirmed tokens as pass stubs: navy pills off the same night palette as
  // the card below, so the tokens read as pieces torn off the pass.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    backgroundColor: '#1C3459',
    borderWidth: 1,
    borderColor: WHITE_FAINT,
  },
  chipText: {
    color: WHITE,
  },
  passInput: {
    color: WHITE,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: 700,
    letterSpacing: 1.5,
    paddingVertical: Spacing.one,
  },
  passHint: {
    color: WHITE_DIM,
  },
  passTitle: {
    color: WHITE,
  },
  passLink: {
    color: COBALT,
  },
  centered: {
    textAlign: 'center',
  },
  passHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  passMeta: {
    gap: Spacing.half,
  },
  passCarrier: {
    color: COBALT,
  },
  loadingCard: {
    alignItems: 'center',
    paddingVertical: Spacing.five,
  },
  rowLabels: {
    flex: 1,
    gap: Spacing.half,
    marginRight: Spacing.two,
  },
  coverageNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
    marginTop: Spacing.one,
  },
  coverageText: {
    flex: 1,
  },
  dateHint: {
    paddingHorizontal: Spacing.one,
    marginTop: Spacing.one,
  },
  input: {
    flex: 1,
    minWidth: 160,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    // Explicit values, not omitted: Fabric on iOS recycles native views, and
    // a TextInput recycled from the flight-number input (letterSpacing 1.5,
    // lineHeight 36) keeps the old kern and line height in its placeholder
    // attributes unless new values overwrite them — the placeholder rendered
    // stretched and bottom-shifted (RN #42589).
    letterSpacing: 0,
    lineHeight: 20,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: Spacing.six,
  },
  rowGroup: {
    gap: Spacing.two,
  },
  detailInputs: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  detailInput: {
    minWidth: 0,
  },
  quickDates: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  quickDate: {
    flex: 1,
  },
  quickDateInner: {
    alignItems: 'center',
    gap: Spacing.half,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  airportInputs: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  // Two-up in a row: let them shrink below the single input's minWidth.
  airportInput: {
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  card: {
    gap: Spacing.two,
    borderRadius: Spacing.four,
    padding: Spacing.four,
  },
  cta: {
    marginTop: Spacing.two,
  },
  timesRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  timeChip: {
    flex: 1,
  },
  timeChipInner: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.half,
  },
  addedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
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
