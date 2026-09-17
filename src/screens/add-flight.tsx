import { registerDocument } from '@/services/document-imports';
import { useAuth } from '@clerk/expo';
import { useQuery } from '@tanstack/react-query';
import { Observe } from 'expo-observe';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
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
import { AirlineSheet } from '@/components/airline-sheet';
import { BoardingPassScanner } from '@/components/boarding-pass-scanner';
import { CalendarMonth } from '@/components/calendar-month';
import { AudienceRow, useCircleFollowers, useVisibilityChooser } from '@/components/trip-audience';
import { YearSheet, type YearRequest } from '@/components/year-sheet';
import {
  MicroLabel,
  PassAction,
  PassCard,
  PassDivider,
  PassRouteRow,
  PASS_AMBER,
} from '@/components/pass-card';
import { PrimaryButton } from '@/components/primary-button';
import { RouteLeg } from '@/components/route-leg';
import { ThemedText } from '@/components/themed-text';
import { TimeDialog } from '@/components/time-dialog';
import { ThemedView } from '@/components/themed-view';
import { COBALT, WHITE, WHITE_DIM, WHITE_FAINT } from '@/components/travel-stats-header';
import { CARRIERS, carrierCodeForName, carrierFor } from '@/constants/carriers';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  airportZone,
  countryName,
  getAirport,
  searchAirports,
  type Airport,
} from '@/services/airports';
import { trackEvent } from '@/services/analytics';
import { resolveFlightDate, type BoardingPass } from '@/services/bcbp';
import { legFor, passCovers, type StoredPass } from '@/services/boarding-pass';
import {
  ADD_FLIGHT_PATH,
  useAddFlightDraft,
  type AddFlightDraft,
  type AddFlightStep,
} from '@/services/add-flight-draft';
import { withYear } from '@/services/year-choice';
import {
  dayOffset,
  flightDay,
  formatDayLabel,
  formatDayLabelWithYear,
  formatTime,
  localDateString,
  wallClock,
  zonedTimestamp,
} from '@/services/dates';
import { haversineKm } from '@/services/geo';
import { classifyFlightInput } from '@/services/flight-input';
import { reconcileNotifications } from '@/services/notification-lifecycle';
import { requestPushPermission } from '@/services/notifications';
import {
  FlightLookupError,
  lookupFlight,
  normalizeFlightNumber,
} from '@/services/flight-lookup';
import { recordDelay } from '@/services/disruptions';
import { addJourney, attachBoardingPass, updateJourney, useJourney } from '@/services/journeys';
import { flagsFor, type TripVisibility } from '@/services/trip-visibility';
import {
  LibraryPermissionError,
  promptForTravelDocument,
} from '@/services/travel-documents';
import { canImportDocuments } from '../../modules/flyright-document-import';

// Progressive token entry: each confirmed value becomes a chip and the flow
// pushes the next step's screen, so back walks through them. Tapping a chip
// pops to that step. 'manual' is the journal path: any trip, any year, no
// lookup involved. The draft the steps share lives in services/add-flight-draft.
type Step = Exclude<AddFlightStep, 'added'>;

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

/** The two timestamps a hand-entered trip is stored with — shared by the save
 * and by the card's route preview, so what the card draws is what My travels
 * will show.
 *
 * An arrival clock earlier than departure means the flight landed next day.
 * The printed clock becomes the instant it names at its airport — the rule
 * imported tickets already follow — so the countdown, the travel-day window
 * and every screen read the same moment wherever the phone is. The airport's
 * zone is what makes "04:15" mean 04:15 at COK; for an airport the table
 * doesn't know, the bare clock is kept. The identical noon pair stays bare:
 * it is the "no times entered" placeholder. */
function manualSchedule(
  date: string,
  depClock: string,
  arrClock: string,
  fromCode: string,
  toCode: string,
): { scheduledDeparture: string; scheduledArrival: string } {
  const arrivalDay =
    arrClock < depClock ? localDateString(new Date(`${date}T12:00:00`), 1) : date;
  const bareDep = `${date}T${depClock}:00`;
  const bareArr = `${arrivalDay}T${arrClock}:00`;
  if (bareDep === bareArr && bareDep.endsWith('T12:00:00')) {
    return { scheduledDeparture: bareDep, scheduledArrival: bareArr };
  }
  return {
    scheduledDeparture: zonedTimestamp(date, depClock, airportZone(fromCode)) ?? bareDep,
    scheduledArrival: zonedTimestamp(arrivalDay, arrClock, airportZone(toCode)) ?? bareArr,
  };
}

const PROMPTS: Record<Step, string> = {
  flight: 'Find it, or add it yourself',
  date: 'Enter the departure date',
  manual: 'Where did the flight take you?',
  result: 'Is this your flight?',
};

/** The scanned code as row fields, when it names the trip being saved;
 * nothing otherwise, so an existing pass on the row is left alone. */
function passFields(pass: StoredPass | null, journey: { number: string; fromCode: string; toCode: string; date?: string }) {
  if (!pass || !passCovers(pass.code, journey)) return {};
  return { passCode: pass.code, passFormat: pass.format, passCapturedAt: new Date().toISOString() };
}

/** The optional booking reference and seat as row fields: trimmed, upper-
 * cased, null when blank. */
function tripDetails(bookingRef: string, seat: string) {
  const ref = bookingRef.trim().toUpperCase();
  const seatNo = seat.trim().toUpperCase();
  return { bookingReference: ref || null, seat: seatNo || null };
}

/** One step of the flow. Each step is its own screen in the My travels
 * stack (see app/(tabs)/(journeys)), pushed over the previous one, so the
 * native back chevron and swipe return to what was already entered. */
export function AddFlight({ step }: { step: Step }) {
  const router = useRouter();
  const theme = useTheme();
  const { userId, isSignedIn, isLoaded: authLoaded } = useAuth();
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
    /** '1' to open with the scanner up — "Add your boarding pass" on a trip. */
    scan?: string;
    journeyId?: string;
  }>();
  const { row: editRow } = useJourney(editId ?? '', userId);
  const { row: passTarget, loaded: passTargetLoaded } = useJourney(prefill.journeyId ?? '', userId);

  const draft = useAddFlightDraft();
  const {
    flightInput,
    flightNumber,
    date,
    pendingDate,
    manualMode,
    fromInput,
    toInput,
    depTime,
    arrTime,
    airline,
    bookingRef,
    seat,
    audience,
    scannedPass,
  } = draft;
  const patch = draft.patch;
  const setFlightInput = (flightInput: string) => patch({ flightInput });
  const setFlightNumber = (flightNumber: string | null) => patch({ flightNumber });
  const setDate = (date: string | null) => patch({ date });
  const setPendingDate = (pendingDate: string | null) => patch({ pendingDate });
  const setManualMode = (manualMode: boolean) => patch({ manualMode });
  const setFromInput = (fromInput: string) => patch({ fromInput });
  const setToInput = (toInput: string) => patch({ toInput });
  const setDepTime = (depTime: string | null) => patch({ depTime });
  const setArrTime = (arrTime: string | null) => patch({ arrTime });
  const setAirline = (airline: AddFlightDraft['airline']) => patch({ airline });
  const setBookingRef = (bookingRef: string) => patch({ bookingRef });
  const setSeat = (seat: string) => patch({ seat });
  const setAudience = (audience: TripVisibility) => patch({ audience });
  const setScannedPass = (scannedPass: StoredPass | null) => patch({ scannedPass });

  /** Move to another step: a push, so back returns here — or a replace when
   * this step has nothing left to say (a lookup that became a journal entry). */
  const go = (next: Step, how: 'push' | 'replace' = 'push') =>
    router[how]({ pathname: ADD_FLIGHT_PATH[next], params: editId ? { editId } : {} });
  /** Pop back to an earlier step's screen (the chips). In edit mode the
   * details screen is the root and sub-steps are pushed over it, so an
   * earlier step is reached by pushing, and returns with back. */
  const backTo = (target: Step) => {
    if (editId) go(target);
    else router.dismissTo({ pathname: ADD_FLIGHT_PATH[target], params: {} });
  };

  const [activeField, setActiveField] = useState<'from' | 'to'>('from');
  // The field the traveller is typing into right now — the only one that
  // shows suggestions. Typing a full code ("HEL") keeps its match listed
  // until it is tapped or submitted: a list that vanished the moment the
  // third letter landed read as "no such airport". Prefills (edit, scan,
  // lookup) never set this, so they open with the fields quiet.
  const [typing, setTyping] = useState<'from' | 'to' | null>(null);
  const toInputRef = useRef<TextInput>(null);
  const [airlineSheetOpen, setAirlineSheetOpen] = useState(false);
  const [timePickerFor, setTimePickerFor] = useState<'dep' | 'arr' | null>(null);
  const followers = useCircleFollowers();
  const { choose: chooseAudience, sheet: audienceSheet } = useVisibilityChooser(followers, {
    signInNext: ADD_FLIGHT_PATH[step],
  });
  const audienceRow = (tone: 'card' | 'pass') =>
    !editId && (
      <AudienceRow
        value={audience}
        followers={followers}
        tone={tone}
        onPress={() => chooseAudience(audience, setAudience)}
      />
    );
  // Boarding-pass scanner open on the flight step (native only — web camera
  // barcode support is too patchy to offer).
  const [scanning, setScanning] = useState(prefill.scan === '1' && Platform.OS !== 'web');

  const inputCandidate = normalizeFlightNumber(flightInput);
  // Why the search action is (or isn't) showing. A pasted booking reference
  // or e-ticket number used to get the same hint as an empty box.
  const inputClass = classifyFlightInput(flightInput);
  const inputHint =
    inputClass.kind === 'pnr'
      ? 'That looks like a booking reference. The flight number is the airline code plus digits, like AY1331, printed next to the airline name on the same ticket.'
      : inputClass.kind === 'ticket'
        ? `That looks like an e-ticket number${inputClass.carrier ? ` from ${inputClass.carrier}` : ''}. The flight number is shorter, like AY1331. Or upload the ticket and we’ll read it.`
        : inputClass.kind === 'flight'
          ? inputClass.carrier
            ? null
            : `We don’t know an airline with the code ${inputClass.flight.slice(0, 2)}. If that’s a booking reference, look for the flight number next to the airline name.`
          : 'The code on your ticket, booking email, or boarding pass.';
  const today = new Date();

  // Seeding the shared draft, once per entry into the flow (`seededFrom` is
  // the guard — the screens remount, the draft doesn't):
  //  - the flight step opened fresh starts from nothing;
  //  - opened from the document import ("Add the route →" on a leg whose
  //    airports the PDF never spelled out) it takes what the document said
  //    and moves straight on to the step that is still missing;
  //  - the details step opened from a trip's "Edit trip details" fills in
  //    from the row (which arrives async from the live query). Only manual
  //    entries are editable — lookup rows mirror the provider.
  const importSeed = !editId && (prefill.flight || prefill.date || prefill.from)
    ? `import:${JSON.stringify(prefill)}`
    : null;
  const reset = draft.reset;
  const seededFrom = draft.seededFrom;
  useEffect(() => {
    if (step !== 'flight' || editId) return;
    if (!importSeed) {
      reset({ seededFrom: 'fresh' });
      return;
    }
    if (seededFrom === importSeed) return;
    const designator = prefill.flight ? normalizeFlightNumber(prefill.flight) : null;
    const manual = prefill.manual === '1' || !designator;
    reset({
      seededFrom: importSeed,
      flightInput: designator ?? '',
      flightNumber: designator,
      date: prefill.date || null,
      fromInput: prefill.from ?? '',
      toInput: prefill.to ?? '',
      bookingRef: prefill.pnr ?? '',
      seat: prefill.seat ?? '',
      depTime: prefill.depTime || null,
      arrTime: prefill.arrTime || null,
      manualMode: manual,
    });
    // The flight step has nothing to add: replace it with the missing step.
    go(!prefill.date ? 'date' : manual ? 'manual' : 'result', 'replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, []);
  useEffect(() => {
    if (!editId || !editRow || seededFrom === `edit:${editId}`) return;
    // A stored airline that isn't the number's prefix was chosen by hand (or
    // read off a codeshare line) — keep it, don't let the prefix overwrite it.
    let airline: AddFlightDraft['airline'] = null;
    if (editRow.carrier && editRow.carrier !== 'Flight') {
      const byPrefix = editRow.number ? carrierFor(editRow.number) : null;
      if (!byPrefix || byPrefix.name !== editRow.carrier) {
        const code = carrierCodeForName(editRow.carrier);
        airline = {
          iata: code ?? '',
          name: code ? CARRIERS[code].name : editRow.carrier,
          country: code ? CARRIERS[code].country : editRow.carrierCountry ?? '',
        };
      }
    }
    // Identical noon timestamps are the "no times entered" placeholder.
    // Pinned rows are instants: read the clock back in the airport's zone.
    const dep = editRow.scheduledDeparture;
    const arr = editRow.scheduledArrival;
    const timed = !(dep === arr && dep.endsWith('T12:00:00'));
    reset({
      seededFrom: `edit:${editId}`,
      manualMode: true,
      fromInput: editRow.fromCode,
      toInput: editRow.toCode,
      date: dep.slice(0, 10),
      flightNumber: editRow.number || null,
      bookingRef: editRow.bookingReference ?? '',
      seat: editRow.seat ?? '',
      airline,
      depTime: timed ? (wallClock(dep, airportZone(editRow.fromCode)) ?? dep.slice(11, 16)) : null,
      arrTime:
        timed && arr !== dep ? (wallClock(arr, airportZone(editRow.toCode)) ?? arr.slice(11, 16)) : null,
    });
  }, [editId, editRow, seededFrom, reset]);

  const confirmFlight = () => {
    if (!inputCandidate) return;
    setFlightNumber(inputCandidate);
    if (editId) {
      // Edits never re-enter the lookup flow — back to the details screen.
      router.back();
      return;
    }
    setManualMode(false);
    go('date');
  };

  const startManual = () => {
    setManualMode(true);
    // From a failed lookup the result screen is spent: the details replace it.
    go(date ? 'manual' : 'date', step === 'result' ? 'replace' : 'push');
  };

  // One scan fills every token at once: flight, date, and the route — the
  // route so that when the lookup 404s (old pass, regional carrier), the
  // manual fallback comes prefilled instead of empty.
  const applyScan = async (pass: BoardingPass, code: StoredPass | null) => {
    if (prefill.journeyId) {
      setScanning(false);
      const target = passTarget && {
        ...passTarget, date: flightDay(passTarget.scheduledDeparture, airportZone(passTarget.fromCode)),
      };
      const matched = target ? legFor(pass, target) : null;
      if (!target || !matched || !code) {
        Alert.alert('Pass not added', !passTargetLoaded
          ? 'The trip is still loading. Please scan again.'
          : 'This code does not match this trip’s route and departure day. Scan the pass for this flight.',
        [{ text: 'Scan again', onPress: () => setScanning(true) }, { text: 'Cancel', style: 'cancel', onPress: () => router.back() }]);
        return;
      }
      try {
        await attachBoardingPass(target.id, code, { seat: matched.seat, bookingReference: matched.pnr });
        trackEvent('boarding_pass_attached', { via: 'camera' });
        router.back();
      } catch {
        Alert.alert('Could not save the pass', 'Please try scanning it again.');
      }
      return;
    }
    const leg = pass.legs[0];
    const designator = normalizeFlightNumber(leg.flight);
    setScanning(false);
    setScannedPass(code);
    setFlightInput(leg.flight);
    setFlightNumber(designator);
    setFromInput(leg.fromCode);
    setToInput(leg.toCode);
    setBookingRef(leg.pnr);
    setSeat(leg.seat ?? '');
    setDate(resolveFlightDate(leg.dayOfYear, today));
    setManualMode(!designator);
    go(designator ? 'result' : 'manual');
    Observe.logEvent('flight.scanned', {
      attributes: { legs: pass.legs.length, lookupable: !!designator },
    });
    trackEvent('boarding_pass_scanned', { legs: pass.legs.length, lookupable: !!designator });
  };

  /** The other way in for a pass that isn't in front of the camera: the PDF
   * the airline emailed, or the screenshot of the one on the phone. Reading
   * it is the import screen's job — the same screen a shared document opens
   * — so this hands the file over and steps aside (the flow's screens are
   * popped first: the form has nothing left to do, and cancelling the import
   * lands back on the journal rather than on a half-filled step). */
  const uploadDocument = async () => {
    Keyboard.dismiss();
    setScanning(false);
    try {
      const picked = await promptForTravelDocument();
      if (!picked) return;
      trackEvent('document_upload_picked', { mimeType: picked.mimeType ?? 'unknown' });
      router.dismissAll();
      router.push({
        pathname: '/import-document',
        params: {
          handle: registerDocument(picked),
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
    patch({ date: day, pendingDate: null });
    // In edit mode the date was pushed over the details screen: back to it.
    if (editId) router.back();
    else go(manualMode ? 'manual' : 'result');
  };

  // The chips: back to the step that set the value, everything else kept —
  // retyping the number and confirming pushes the later steps again.
  const editFlight = () => {
    patch({ flightInput: flightNumber ?? '', pendingDate: date });
    backTo('flight');
  };

  const editDate = () => {
    // Stage the current date so the calendar reopens on it, pre-selected.
    setPendingDate(date);
    backTo('date');
  };

  // The year on its own. A scanned pass carries no year and the app guesses
  // the closest one, which for an old pass is a year too late — the day and
  // month are right, and only the year needs touching. The chip opens a
  // wheel (components/year-sheet); the calendar stays for everything else.
  const [yearRequest, setYearRequest] = useState<YearRequest | null>(null);
  const editYear = () => {
    if (!date) return;
    setYearRequest({
      date,
      onPick: (y) => {
        if (y === Number(date.slice(0, 4))) return;
        trackEvent('flight_year_changed', { from: Number(date.slice(0, 4)), to: y });
        setDate(withYear(date, y));
        // A corrected year is the traveller's word against the provider's,
        // so nothing is looked up again: the flight already on screen (or
        // the scanned route) becomes the journal entry, times carried over.
        if (flight) {
          if (flight.from.code) setFromInput(flight.from.code);
          if (flight.to.code) setToInput(flight.to.code);
          setDepTime(wallClock(flight.scheduledDeparture, airportZone(flight.from.code)));
          setArrTime(wallClock(flight.scheduledArrival, airportZone(flight.to.code)));
        }
        setManualMode(true);
        // The lookup result no longer applies: the details take its place.
        if (step !== 'manual') go('manual', 'replace');
      },
    });
  };

  // Wait for session hydration before choosing the account or guest budget.
  // Identity in the key retries a guest refusal after signing in.
  const lookupAllowed = authLoaded;
  const lookup = useQuery({
    queryKey: ['flight-status', flightNumber, date, userId ?? 'guest'],
    queryFn: () => lookupFlight(flightNumber!, date!),
    enabled: step === 'result' && !!flightNumber && !!date && lookupAllowed,
    retry: false,
  });
  const signInError = lookup.error instanceof FlightLookupError && lookup.error.signInRequired
    ? lookup.error : null;

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
      ...passFields(scannedPass, { number: flight.flight, fromCode: flight.from.code!, toCode: flight.to.code!, date: flight.date }),
      ...flagsFor(audience),
      createdAt: new Date().toISOString(),
    });
    trackEvent('flight_added', { source: 'lookup', pass: !!scannedPass });
    // The lookup already knows the arrival delay — cache it so the journeys
    // list can badge an owed row without another status call.
    if (flight.delayMinutes != null) {
      await recordDelay(`${flight.flight}-${flight.date}`, flight.delayMinutes);
    }
    finish(routeKnown ? `${flight.from.code} → ${flight.to.code}` : null);
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

  /** A suggestion tapped, or Return pressed on a field that already names an
   * airport: the code goes in, the list closes, and the cursor moves on —
   * From hands over to To, To puts the keyboard away. Return on a field that
   * doesn't resolve just dismisses, leaving the list up to pick from. */
  const confirmAirport = (field: 'from' | 'to', airport: Airport | undefined) => {
    if (!airport) {
      Keyboard.dismiss();
      return;
    }
    if (field === 'from') setFromInput(airport.iata);
    else setToInput(airport.iata);
    setTyping(null);
    if (field === 'from') toInputRef.current?.focus();
    else Keyboard.dismiss();
  };

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

  const manualPreview =
    fromAirport && toAirport && date
      ? manualSchedule(date, depClock, arrClock, fromAirport.iata, toAirport.iata)
      : null;

  // The airline the entry is saved under: chosen by hand, else the number's.
  const manualCarrier = airline ?? (flightNumber ? carrierFor(flightNumber) : null);

  const saveManual = async () => {
    if (!fromAirport || !toAirport || !date) return;
    const carrier = manualCarrier;
    const distanceKm = haversineKm(
      fromAirport.lat,
      fromAirport.lon,
      toAirport.lat,
      toAirport.lon,
    );
    const { scheduledDeparture, scheduledArrival } = manualSchedule(
      date,
      depClock,
      arrClock,
      fromAirport.iata,
      toAirport.iata,
    );

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
        scheduledDeparture,
        scheduledArrival,
        ...tripDetails(bookingRef, seat),
      });
      finish(`${fromAirport.iata} → ${toAirport.iata}`);
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
      scheduledDeparture,
      scheduledArrival,
      ...tripDetails(bookingRef, seat),
      ...passFields(scannedPass, { number: flightNumber ?? '', fromCode: fromAirport.iata, toCode: toAirport.iata, date: date ?? undefined }),
      ...flagsFor(audience),
      createdAt: new Date().toISOString(),
    });
    finish(`${fromAirport.iata} → ${toAirport.iata}`);
    trackEvent('flight_added', { source: 'manual', pass: !!scannedPass });
    Observe.logEvent('flight.added_manually', {
      attributes: {
        route: `${fromAirport.iata}-${toAirport.iata}`,
        distanceKm,
        hasNumber: !!flightNumber,
      },
    });
    // Journal entries aren't watched, so no push-permission ask here.
  };

  /** The saving step is spent: the confirmation takes its place, and then
   * leaves the flow — back to the trip for an edit, to My travels for a new
   * trip (the whole stack of steps goes with it). */
  const finish = (savedRoute: string | null) => {
    const label = [savedRoute, flightNumber].filter(Boolean).join(' · ');
    router.replace({
      pathname: ADD_FLIGHT_PATH.added,
      params: {
        title: editId
          ? 'Trip updated'
          : manualMode || flightPast
            ? 'Saved to My travels'
            : 'Added to My travels',
        subtitle: editId
          ? 'Your changes are saved.'
          : manualMode
            ? 'Your journal has the trip covered.'
            : flightPast
              ? 'If the flight was disrupted, your verdict is waiting on the trip page.'
              : "We're watching it — you'll hear about delays, gates, and anything you're owed.",
        label,
        exit: editId ? 'back' : 'top',
      },
    });
  };

  return (
    <ThemedView style={styles.container}>
      {/* The title and the way back are the stack's header. */}
      <ThemedText themeColor="textSecondary">
        {editId && step === 'manual'
          ? 'Update your trip details'
          : editId && step === 'flight'
            ? 'Enter your flight number'
            : PROMPTS[step]}
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
            <>
              <Pressable onPress={editDate} testID="token-date">
                <View style={styles.chip}>
                  <SymbolView
                    name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }}
                    size={12}
                    tintColor={COBALT}
                  />
                  <ThemedText type="smallBold" style={styles.chipText}>
                    {formatDayLabel(date)}
                  </ThemedText>
                </View>
              </Pressable>
              {/* The year as its own stub, since it is the one part of a
                  scanned date that was guessed. Dimmer when it is this year,
                  loud when it isn't — a trip a year out (or back) should be
                  noticed before it is saved. */}
              <Pressable
                onPress={editYear}
                testID="token-year"
                accessibilityRole="button"
                accessibilityLabel={`Year ${date.slice(0, 4)}. Change`}>
                <View
                  style={[
                    styles.chip,
                    date.slice(0, 4) !== localDateString(today).slice(0, 4) && styles.chipLoud,
                  ]}>
                  <ThemedText type="smallBold" style={styles.chipText}>
                    {date.slice(0, 4)}
                  </ThemedText>
                  <SymbolView
                    name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
                    size={10}
                    weight="semibold"
                    tintColor={COBALT}
                  />
                </View>
              </Pressable>
            </>
          )}
        </View>
      )}
      <YearSheet request={yearRequest} today={today} onClose={() => setYearRequest(null)} />
      {audienceSheet}
      <AirlineSheet
        visible={airlineSheetOpen}
        selected={manualCarrier?.iata}
        onClose={() => setAirlineSheetOpen(false)}
        onPick={(picked) => {
          setAirline(picked);
          setAirlineSheetOpen(false);
          trackEvent('manual_airline_changed', { code: picked.iata });
        }}
      />

      {/* Every step scrolls: the calendar, the manual card with its time
          spinner, and small screens all need the escape hatch. Taps must
          survive an open keyboard so airport suggestions stay one-tap. */}
      <KeyboardAvoidingView
        style={styles.body}
        // iOS: the scroll view insets itself for the keyboard (below), so the
        // save button can always be scrolled above it. Android's adjustResize
        // is dead under edge-to-edge, so the view pads instead.
        behavior={Platform.OS === 'android' ? 'padding' : undefined}
        enabled={Platform.OS === 'android'}>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}>
        {step === 'flight' && (
          <View style={styles.rowGroup}>
            {/* The blank boarding pass: the flight number gets written onto
                the same night-sky card the travel-day hero renders, so adding
                a flight already looks like the thing you'll travel with. The
                camera and the emailed PDF are ways of finding the same flight,
                so they ride on the pass as its stub until the slot holds
                something flight-shaped, when the stub becomes the search. No
                autofocus: the other ticket below stays in plain sight instead
                of under the keyboard. */}
            {!scanning && (
              <PassCard>
                <MicroLabel>{editId ? 'Flight number' : 'Find my flight'}</MicroLabel>
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
                {inputHint && (
                  <ThemedText type="small" style={styles.passHint} testID="flight-input-hint">
                    {inputHint}
                  </ThemedText>
                )}
                {inputCandidate ? (
                  <>
                    <PassDivider />
                    <PassAction
                      testID="search-flight"
                      label="Search this flight →"
                      onPress={confirmFlight}
                    />
                  </>
                ) : (
                  Platform.OS !== 'web' &&
                  !editId && (
                    <View style={styles.passPills}>
                      <PassPill
                        testID="scan-boarding-pass"
                        icon={{
                          ios: 'viewfinder',
                          android: 'qr_code_scanner',
                          web: 'qr_code_scanner',
                        }}
                        label="Scan a pass"
                        onPress={() => {
                          Keyboard.dismiss();
                          setScanning(true);
                        }}
                      />
                      {canImportDocuments && (
                        <PassPill
                          testID="upload-boarding-pass"
                          icon={{
                            ios: 'square.and.arrow.up',
                            android: 'upload_file',
                            web: 'upload_file',
                          }}
                          label="Upload ticket"
                          onPress={uploadDocument}
                        />
                      )}
                    </View>
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
                {/* The other door, as the pass's equal: a blank paper ticket
                    with the route still to be written in, set against the
                    navy one by an "or". It carries the screen's only filled
                    blue button, so typing a trip in by hand can't trail the
                    lookup as a footnote. */}
                <View style={styles.orRow}>
                  <View style={[styles.orLine, { backgroundColor: `${theme.textSecondary}40` }]} />
                  <ThemedText type="small" themeColor="textSecondary" style={styles.orText}>
                    Or
                  </ThemedText>
                  <View style={[styles.orLine, { backgroundColor: `${theme.textSecondary}40` }]} />
                </View>
                <BlankTicket
                  onPress={() => {
                    Keyboard.dismiss();
                    startManual();
                  }}
                />
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
                    {authLoaded && !isSignedIn ? ' Try 5 live lookups a day without an account.' : ''}
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

        {step === 'result' && signInError && (
          <PassCard>
            <MicroLabel>Live tracking</MicroLabel>
            <ThemedText type="smallBold" style={styles.passTitle}>
              {signInError.message}
            </ThemedText>
            <ThemedText type="small" style={styles.passHint}>
              Sign in with a free account for more lookups. Your guest allowance
              resets at midnight UTC, and you can save this flight to your journal now.
            </ThemedText>
            <PassDivider />
            <PassAction
              icon={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }}
              label="Sign in →"
              onPress={() =>
                router.push({ pathname: '/sign-in', params: { next: String(ADD_FLIGHT_PATH.result) } })
              }
            />
            <Pressable onPress={startManual} hitSlop={Spacing.two}>
              <ThemedText type="smallBold" style={[styles.passLink, styles.centered]}>
                Save to journal instead →
              </ThemedText>
            </Pressable>
          </PassCard>
        )}

        {step === 'result' && lookup.isPending && (
          <PassCard style={styles.loadingCard}>
            <ActivityIndicator color={WHITE} />
            <ThemedText type="small" style={styles.passHint}>
              Looking up {flightNumber}…
            </ThemedText>
          </PassCard>
        )}

        {step === 'result' && lookupAllowed && lookup.isError && !signInError && (
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
              <View style={styles.airportColumn}>
                <TextInput
                  autoFocus
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={fromInput}
                  onChangeText={(text) => {
                    setFromInput(text);
                    setTyping('from');
                  }}
                  onFocus={() => setActiveField('from')}
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => confirmAirport('from', fromAirport)}
                  placeholder="From · city or HEL"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    styles.airportInput,
                    { color: theme.text, backgroundColor: theme.field },
                  ]}
                />
                {fromAirport && typing !== 'from' && <AirportCaption airport={fromAirport} />}
              </View>
              <View style={styles.airportColumn}>
                <TextInput
                  ref={toInputRef}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={toInput}
                  onChangeText={(text) => {
                    setToInput(text);
                    setTyping('to');
                  }}
                  onFocus={() => setActiveField('to')}
                  returnKeyType="done"
                  onSubmitEditing={() => confirmAirport('to', toAirport)}
                  placeholder="To · city or JFK"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    styles.airportInput,
                    { color: theme.text, backgroundColor: theme.field },
                  ]}
                />
                {toAirport && typing !== 'to' && <AirportCaption airport={toAirport} />}
              </View>
            </View>

            {typing === activeField && (
              <AirportSuggestions
                query={activeField === 'from' ? fromInput : toInput}
                onPick={(airport) => confirmAirport(activeField, airport)}
              />
            )}

            {fromAirport && toAirport && (
              <ThemedView type="backgroundElement" style={styles.card}>
                {/* The leg the way every other screen draws it — codes, cities,
                    contrail and plane, clocks and block time — never a typed
                    arrow. It is fed the same timestamps the save writes, so
                    the card previews the row My travels will show and moves
                    as the times below are changed. */}
                <ThemedText type="small" themeColor="textSecondary">
                  {[date ? formatDayLabel(date) : null, flightNumber].filter(Boolean).join(' · ')}
                </ThemedText>
                <RouteLeg
                  leg={{
                    fromCode: fromAirport.iata,
                    toCode: toAirport.iata,
                    departure: manualPreview?.scheduledDeparture ?? '',
                    arrival: manualPreview?.scheduledArrival ?? '',
                    distanceKm: manualKm,
                  }}
                />
                {/* The airline, as a chip like the times: the prefix's guess
                    until it's tapped, then a short search over the carriers
                    we know. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Airline ${manualCarrier?.name ?? 'not set'}. Change`}
                  testID="manual-airline"
                  style={styles.timeChip}
                  onPress={() => {
                    Keyboard.dismiss();
                    setTimePickerFor(null);
                    setAirlineSheetOpen(true);
                  }}>
                  <ThemedView
                    type="background"
                    style={[styles.timeChipInner, styles.airlineChip]}>
                    {manualCarrier && (
                      <AirlineLogo number={flightNumber ?? ''} carrier={manualCarrier.name} size={24} />
                    )}
                    <View style={styles.airlineChipText}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Airline
                      </ThemedText>
                      <ThemedText type="smallBold" themeColor="tint" numberOfLines={1}>
                        {manualCarrier?.name ?? 'Choose an airline'}
                      </ThemedText>
                    </View>
                  </ThemedView>
                </Pressable>
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
                  <TimeDialog
                    value={
                      new Date(`${date}T${timePickerFor === 'dep' ? depClock : arrClock}:00`)
                    }
                    onDismiss={() => setTimePickerFor(null)}
                    onPick={(picked) => {
                      const clock = `${`${picked.getHours()}`.padStart(2, '0')}:${`${picked.getMinutes()}`.padStart(2, '0')}`;
                      if (timePickerFor === 'dep') setDepTime(clock);
                      else setArrTime(clock);
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
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
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
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    placeholder="Seat"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.input, styles.detailInput, { color: theme.text, backgroundColor: theme.field }]}
                  />
                </View>
                {audienceRow('card')}
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
                      flight.scheduledDeparture
                        ? formatTime(flight.scheduledDeparture, airportZone(flight.from.code))
                        : null
                    }
                    arrTime={
                      flight.scheduledArrival
                        ? formatTime(flight.scheduledArrival, airportZone(flight.to.code))
                        : null
                    }
                    arrDayOffset={
                      flight.scheduledDeparture && flight.scheduledArrival
                        ? dayOffset(
                            flight.scheduledDeparture,
                            airportZone(flight.from.code),
                            flight.scheduledArrival,
                            airportZone(flight.to.code),
                          )
                        : null
                    }
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
                  {audienceRow('pass')}
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
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

/** The confirmation that replaces the saving step: a tick, what was saved,
 * and then out of the flow by itself — back to the trip after an edit,
 * to My travels (popping every step) after a new trip. Only while focused,
 * so an incoming link cannot pop a screen it didn't open. */
export function AddFlightDone() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { title, subtitle, label, exit } = useLocalSearchParams<{
    title?: string;
    subtitle?: string;
    label?: string;
    exit?: 'back' | 'top';
  }>();
  useFocusEffect(
    useCallback(() => {
      const dismissTimer = setTimeout(() => {
        if (exit === 'back' && router.canGoBack()) router.back();
        else if (router.canDismiss()) router.dismissAll();
        else router.replace('/');
      }, 1600);
      return () => clearTimeout(dismissTimer);
    }, [exit, router]),
  );

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
          {title ?? 'Saved to My travels'}
        </ThemedText>
        {!!label && (
          <View style={styles.chip}>
            <SymbolView
              name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
              size={12}
              tintColor={COBALT}
            />
            <ThemedText type="smallBold" style={styles.chipText}>
              {label}
            </ThemedText>
          </View>
        )}
        {!!subtitle && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.addedSub}>
            {subtitle}
          </ThemedText>
        )}
      </Animated.View>
    </ThemedView>
  );
}

/** A quiet action on the navy pass: outlined, so the pass's white stub
 * button stays the loud one when it appears. */
function PassPill({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.passPill, { opacity: pressed ? 0.7 : 1 }]}>
      <SymbolView name={icon} size={16} weight="semibold" tintColor={WHITE} />
      <ThemedText type="smallBold" style={styles.passPillLabel} numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const ROUTE_DASHES = Array.from({ length: 12 }, (_, i) => i);
/** Radius of a ticket punch. */
const NOTCH = 11;

/** The manual path, drawn as a paper ticket: what it is in words, and the
 * button that starts it. The route line is decoration only — dots and a
 * plane, never airport codes or slots, which read as a route already set or
 * as fields to type into. The whole card is the target; the button names
 * the action. */
function BlankTicket({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const edge = `${theme.tint}55`;
  const dashes = (
    <View style={styles.ticketDashes}>
      {ROUTE_DASHES.map((i) => (
        <View key={i} style={[styles.ticketDash, { backgroundColor: edge }]} />
      ))}
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add it manually. No flight number needed — pick the day first, then the airports"
      testID="add-manually"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <View>
        <ThemedView type="backgroundElement" style={[styles.ticket, { borderColor: edge }]}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.ticketLabel}>
            Add it manually
          </ThemedText>
          <View style={styles.ticketRoute} accessible={false} importantForAccessibility="no-hide-descendants">
            <View style={[styles.ticketStop, { borderColor: theme.tint }]} />
            {dashes}
            <SymbolView
              name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
              size={18}
              tintColor={theme.tint}
              style={Platform.OS === 'ios' ? undefined : styles.ticketPlane}
            />
            {dashes}
            <View style={[styles.ticketStop, { borderColor: theme.tint }]} />
          </View>
          <View style={styles.ticketCopy}>
            <ThemedText type="smallBold" style={styles.ticketTitle}>
              No flight number? Add it yourself
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Pick the day first, then the airports — any trip, any year.
            </ThemedText>
          </View>
          <PrimaryButton label="Start with the date →" onPress={onPress} />
        </ThemedView>
        {/* The punches that make a card read as a ticket. Each is a circle
            straddling the edge, drawn over the card and clipped to its inner
            half: the fill in the screen's colour eats the border where it
            passes, and the circle's own stroke draws the notch. Drawn inside
            the card they never could — a view clips its children inside its
            border, so the border ran straight across the mouth. */}
        {(['left', 'right'] as const).map((side) => (
          <View
            key={side}
            pointerEvents="none"
            style={[styles.ticketNotchWindow, side === 'left' ? styles.windowLeft : styles.windowRight]}>
            <View
              style={[
                styles.ticketNotch,
                side === 'left' ? styles.notchLeft : styles.notchRight,
                { backgroundColor: theme.background, borderColor: edge },
              ]}
            />
          </View>
        ))}
      </View>
    </Pressable>
  );
}

/** What a resolved code stands for, printed under its field once the list
 * has closed so "HEL" reads as Helsinki Vantaa Airport rather than three
 * letters the app accepted. */
function AirportCaption({ airport }: { airport: Airport }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.caption}>
      {airport.name ?? `${airport.city}, ${countryName(airport.country)}`}
    </ThemedText>
  );
}

/** Up to six airport matches for the field being typed in — tapping one
 * confirms it. The exact code match stays listed (highlighted, on top) so
 * a traveller who types "HEL" sees Helsinki offered, not a list that
 * vanished; a query nothing matches says so instead of going quiet. */
function AirportSuggestions({
  query,
  onPick,
}: {
  query: string;
  onPick: (airport: Airport) => void;
}) {
  const q = query.trim();
  if (q.length < 2) return null;
  // Six, not three: prefix typing ("LA") fans out over many codes, and the
  // step has the vertical room — the body scrolls and nothing renders below
  // the suggestions until an airport resolves.
  const matches = searchAirports(q, 6);
  if (!matches.length) {
    if (q.length < 3) return null;
    return (
      <ThemedView type="backgroundElement" style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.airportText}>
          No airport matches “{q}” — try the city name.
        </ThemedText>
      </ThemedView>
    );
  }
  const exact = q.toUpperCase();

  return (
    <View style={styles.rowGroup}>
      {matches.map((airport) => (
        <Pressable
          key={airport.iata}
          accessibilityRole="button"
          accessibilityLabel={`${airport.iata}, ${airport.name ?? airport.city}`}
          onPress={() => onPick(airport)}>
          <ThemedView
            type={airport.iata === exact ? 'backgroundSelected' : 'backgroundElement'}
            style={styles.row}>
            <View style={styles.airportText}>
              <ThemedText type="smallBold">
                {airport.iata} · {airport.city}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {airport.name ? `${airport.name} · ` : ''}
                {countryName(airport.country)}
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
    // No delay at all means the provider never reported the arrival (see
    // flightNormalize): it flew, and "on time" would be a claim too far.
    return (
      <ThemedText type="small" style={{ color: '#2FD68C' }}>
        {delayMinutes == null ? 'Arrived' : 'Arrived on time'}
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
    paddingTop: Spacing.three,
    gap: Spacing.three,
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
  chipLoud: {
    borderColor: COBALT,
    backgroundColor: '#1E3F73',
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
  passPills: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  passPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(242,246,251,0.18)',
    backgroundColor: 'rgba(242,246,251,0.10)',
    paddingVertical: Spacing.three - 2,
    paddingHorizontal: Spacing.two,
  },
  passPillLabel: {
    color: WHITE,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.two,
    marginVertical: Spacing.one,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  orText: {
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 11,
    lineHeight: 14,
  },
  ticket: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    borderWidth: 1.5,
  },
  ticketLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 11,
    lineHeight: 14,
  },
  ticketRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  ticketStop: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  ticketCopy: {
    gap: Spacing.one,
  },
  ticketTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  ticketDashes: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  ticketDash: {
    width: 5,
    height: 2,
    borderRadius: 1,
  },
  ticketPlane: {
    transform: [{ rotate: '90deg' }],
  },
  ticketNotchWindow: {
    position: 'absolute',
    top: '50%',
    width: NOTCH,
    height: NOTCH * 2,
    marginTop: -NOTCH,
    overflow: 'hidden',
  },
  windowLeft: {
    left: 0,
  },
  windowRight: {
    right: 0,
  },
  ticketNotch: {
    position: 'absolute',
    top: 0,
    width: NOTCH * 2,
    height: NOTCH * 2,
    borderRadius: NOTCH,
    borderWidth: 1.5,
  },
  notchLeft: {
    left: -NOTCH,
  },
  notchRight: {
    right: -NOTCH,
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
  airportColumn: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  airportInput: {
    flex: 0,
    minWidth: 0,
  },
  caption: {
    paddingHorizontal: Spacing.one,
  },
  airportText: {
    flex: 1,
    minWidth: 0,
    marginRight: Spacing.two,
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
  airlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  airlineChipText: {
    flex: 1,
    minWidth: 0,
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
