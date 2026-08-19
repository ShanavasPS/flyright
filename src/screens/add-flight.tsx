import { useAuth } from '@clerk/expo';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useQuery } from '@tanstack/react-query';
import { Observe } from 'expo-observe';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { carrierFor } from '@/constants/carriers';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getAirport, searchAirports, type Airport } from '@/services/airports';
import {
  formatDayLabel,
  formatDayLabelWithYear,
  formatTime,
  localDateString,
} from '@/services/dates';
import { haversineKm } from '@/services/geo';
import { requestPushPermission } from '@/services/notifications';
import {
  FlightLookupError,
  lookupFlight,
  normalizeFlightNumber,
} from '@/services/flight-lookup';
import { recordDelay } from '@/services/disruptions';
import { addJourney, updateJourney, useJourney } from '@/services/journeys';

// Progressive token entry, Flighty-style: each confirmed value becomes a chip
// and the sheet moves to the next step. Tapping a chip reopens that step.
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

export function AddFlight() {
  const router = useRouter();
  const theme = useTheme();
  const { userId } = useAuth();
  // Edit mode: the journey detail screen reopens this sheet with ?editId=<id>
  // for a manual entry, prefilled below. The row id stays stable across the
  // save so claims/disruptions references and the cloud sync key survive.
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const editRow = useJourney(editId ?? '', userId);

  const [step, setStep] = useState<Step>('flight');
  const [flightInput, setFlightInput] = useState('');
  const [flightNumber, setFlightNumber] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Calendar picks are staged, not instant: the year/month wheels fire
  // onValueChange on every spin, and decade-old journal dates need several
  // spins before the user has actually chosen a day.
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

  const inputCandidate = normalizeFlightNumber(flightInput);
  const today = new Date();

  // Prefill once from the row being edited, then jump straight to the manual
  // form (the guarded set-state-during-render pattern — the row arrives async
  // from the live query). Only manual entries are editable — lookup rows
  // mirror the provider.
  const [prefilled, setPrefilled] = useState(false);
  if (editId && editRow && !prefilled) {
    setPrefilled(true);
    setManualMode(true);
    setFromInput(editRow.fromCode);
    setToInput(editRow.toCode);
    setDate(editRow.scheduledDeparture.slice(0, 10));
    if (editRow.number) setFlightNumber(editRow.number);
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

  const confirmDate = (day: string) => {
    setDate(day);
    setCalendarOpen(false);
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
    setDate(null);
    setStep('date');
  };

  const lookup = useQuery({
    queryKey: ['flight-status', flightNumber, date],
    queryFn: () => lookupFlight(flightNumber!, date!),
    enabled: step === 'result' && !!flightNumber && !!date,
    retry: false,
  });

  const flight = lookup.data;
  const routeKnown = !!flight?.from.code && !!flight?.to.code;

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
      createdAt: new Date().toISOString(),
    });
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
    // iOS shows the system dialog once; subsequent calls are no-ops.
    requestPushPermission().catch(() => {});
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
      createdAt: new Date().toISOString(),
    });
    setStep('added');
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
    dismissTimer.current = setTimeout(() => router.back(), 1200);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [step, router]);

  if (step === 'added') {
    return (
      <ThemedView style={[styles.container, styles.addedContainer]}>
        <Animated.View entering={ZoomIn.springify()} style={styles.addedBadge}>
          <ThemedText style={[styles.addedCheck, { color: theme.success }]}>✓</ThemedText>
          <ThemedText type="subtitle">{editId ? 'Trip updated' : 'Added to My travels'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {manualMode
              ? `${fromInput.toUpperCase()} → ${toInput.toUpperCase()} is ${editId ? 'up to date' : 'in your journal'}.`
              : `We're watching ${flightNumber} for you.`}
          </ThemedText>
        </Animated.View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
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

      <View style={styles.tokenRow}>
        {flightNumber && (
          <Pressable onPress={editFlight}>
            <ThemedView type="backgroundSelected" style={styles.chip}>
              <ThemedText type="smallBold" themeColor="tint">
                {flightNumber}
              </ThemedText>
            </ThemedView>
          </Pressable>
        )}
        {date && (
          <Pressable onPress={editDate}>
            <ThemedView type="backgroundSelected" style={styles.chip}>
              <ThemedText type="smallBold" themeColor="tint">
                {/* Journal dates can be years back — ambiguity needs the year. */}
                {date.slice(0, 4) === localDateString(today).slice(0, 4)
                  ? formatDayLabel(date)
                  : formatDayLabelWithYear(date)}
              </ThemedText>
            </ThemedView>
          </Pressable>
        )}
        {step === 'flight' && (
          <TextInput
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            value={flightInput}
            onChangeText={setFlightInput}
            onSubmitEditing={confirmFlight}
            placeholder="AY1331 or LH873"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="search"
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.backgroundElement },
            ]}
          />
        )}
      </View>

      {/* Plain View on purpose: a ScrollView inside a formSheet is captured by
          the sheet's drag-to-resize integration and hoisted over the header. */}
      <View style={styles.body}>
        {step === 'flight' && inputCandidate && (
          <Pressable onPress={confirmFlight}>
            <ThemedView type="backgroundElement" style={styles.row}>
              <View>
                <ThemedText type="smallBold">{inputCandidate}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Search this flight
                </ThemedText>
              </View>
              <ThemedText themeColor="tint">→</ThemedText>
            </ThemedView>
          </Pressable>
        )}

        {step === 'flight' && !inputCandidate && (
          <Pressable onPress={startManual} hitSlop={Spacing.two}>
            <ThemedText type="link">No flight number? Add a trip manually →</ThemedText>
          </Pressable>
        )}

        {step === 'date' && (
          <View style={styles.rowGroup}>
            {(
              [
                { label: 'Today', day: localDateString(today) },
                { label: 'Tomorrow', day: localDateString(today, 1) },
                { label: 'Yesterday', day: localDateString(today, -1) },
              ] as const
            ).map(({ label, day }) => (
              <Pressable key={label} onPress={() => confirmDate(day)}>
                <ThemedView type="backgroundElement" style={styles.row}>
                  <View>
                    <ThemedText type="smallBold">{label}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatDayLabel(day)}
                    </ThemedText>
                  </View>
                  <ThemedText themeColor="tint">→</ThemedText>
                </ThemedView>
              </Pressable>
            ))}
            <Pressable onPress={() => setCalendarOpen((open) => !open)}>
              <ThemedView type="backgroundElement" style={styles.row}>
                <ThemedText type="smallBold">Pick a date</ThemedText>
                <ThemedText themeColor="tint">{calendarOpen ? '▴' : '▾'}</ThemedText>
              </ThemedView>
            </Pressable>
            {calendarOpen && pendingDate && (
              <Pressable onPress={() => confirmDate(pendingDate)}>
                <ThemedView type="backgroundSelected" style={styles.row}>
                  <ThemedText type="smallBold" themeColor="tint">
                    Use {formatDayLabelWithYear(pendingDate)}
                  </ThemedText>
                  <ThemedText themeColor="tint">→</ThemedText>
                </ThemedView>
              </Pressable>
            )}
            {calendarOpen && (
              <ThemedView type="backgroundElement" style={styles.calendar}>
                <DateTimePicker
                  value={pendingDate ? new Date(`${pendingDate}T12:00:00`) : today}
                  mode="date"
                  display="inline"
                  presentation="inline"
                  // The journal reaches decades back; schedules only ~11 months forward.
                  minimumDate={new Date(today.getFullYear() - 30, today.getMonth(), today.getDate())}
                  maximumDate={new Date(today.getFullYear(), today.getMonth() + 11, today.getDate())}
                  accentColor={theme.tint}
                  onValueChange={(_event, picked) => setPendingDate(localDateString(picked))}
                />
              </ThemedView>
            )}
          </View>
        )}

        {step === 'result' && lookup.isPending && (
          <View style={styles.loading}>
            <ActivityIndicator />
            <ThemedText type="small" themeColor="textSecondary">
              Looking up {flightNumber}…
            </ThemedText>
          </View>
        )}

        {step === 'result' && lookup.isError && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">
              {lookup.error instanceof FlightLookupError
                ? lookup.error.message
                : 'Flight lookup failed — try again.'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Older flights often aren&apos;t in the provider&apos;s records — you can
              still add this trip to your journal.
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
                  { color: theme.text, backgroundColor: theme.backgroundElement },
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
                  { color: theme.text, backgroundColor: theme.backgroundElement },
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
                    presentation="inline"
                    accentColor={theme.tint}
                    onDismiss={() => setTimePickerFor(null)}
                    onValueChange={(_event, picked) => {
                      const clock = `${`${picked.getHours()}`.padStart(2, '0')}:${`${picked.getMinutes()}`.padStart(2, '0')}`;
                      if (timePickerFor === 'dep') setDepTime(clock);
                      else setArrTime(clock);
                    }}
                  />
                )}
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

        {step === 'result' && flight && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              {flight.carrier.name} {flight.flight} · {formatDayLabel(flight.date)}
            </ThemedText>
            {routeKnown ? (
              <>
                <ThemedText type="subtitle" themeColor="heading">
                  {flight.from.code} → {flight.to.code}
                </ThemedText>
                <ThemedText type="small">
                  Departs {formatTime(flight.scheduledDeparture)} · Arrives{' '}
                  {formatTime(flight.scheduledArrival)}
                </ThemedText>
                <StatusLine status={flight.status} delayMinutes={flight.delayMinutes} />
                <View style={styles.cta}>
                  <PrimaryButton label="Track this flight →" onPress={track} />
                </View>
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                The provider returned no route for this flight — try another day.
              </ThemedText>
            )}
          </ThemedView>
        )}
      </View>
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
  const matches = searchAirports(q, 3);
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

function StatusLine({ status, delayMinutes }: { status: string; delayMinutes: number | null }) {
  const theme = useTheme();

  if (delayMinutes != null && delayMinutes > 0) {
    return (
      <ThemedText type="small" style={{ color: theme.danger }}>
        Arrived {delayMinutes} min late
      </ThemedText>
    );
  }
  if (delayMinutes === 0) {
    return (
      <ThemedText type="small" style={{ color: theme.success }}>
        Arrived on time
      </ThemedText>
    );
  }
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {status === 'scheduled' ? "Scheduled — we'll watch it for delays" : `Status: ${status}`}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  chip: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  input: {
    flex: 1,
    minWidth: 160,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  body: {
    flex: 1,
  },
  rowGroup: {
    gap: Spacing.two,
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
  calendar: {
    borderRadius: Spacing.three,
    padding: Spacing.two,
  },
  loading: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
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
    gap: Spacing.two,
  },
  addedCheck: {
    fontSize: 64,
    lineHeight: 72,
  },
});
