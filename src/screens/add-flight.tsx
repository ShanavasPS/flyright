import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useQuery } from '@tanstack/react-query';
import { Observe } from 'expo-observe';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayLabel, formatTime, localDateString } from '@/services/dates';
import { requestPushPermission } from '@/services/notifications';
import {
  FlightLookupError,
  lookupFlight,
  normalizeFlightNumber,
} from '@/services/flight-lookup';
import { addJourney } from '@/services/journeys';

// Progressive token entry, Flighty-style: each confirmed value becomes a chip
// and the sheet moves to the next step. Tapping a chip reopens that step.
type Step = 'flight' | 'date' | 'result' | 'added';

const PROMPTS: Record<Step, string> = {
  flight: 'Enter your flight number',
  date: 'Enter the departure date',
  result: 'Is this your flight?',
  added: '',
};

export function AddFlight() {
  const router = useRouter();
  const theme = useTheme();

  const [step, setStep] = useState<Step>('flight');
  const [flightInput, setFlightInput] = useState('');
  const [flightNumber, setFlightNumber] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const inputCandidate = normalizeFlightNumber(flightInput);
  const today = new Date();

  const confirmFlight = () => {
    if (!inputCandidate) return;
    setFlightNumber(inputCandidate);
    setStep('date');
  };

  const confirmDate = (day: string) => {
    setDate(day);
    setCalendarOpen(false);
    setStep('result');
  };

  const editFlight = () => {
    setFlightInput(flightNumber ?? '');
    setFlightNumber(null);
    setDate(null);
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
      mode: 'flight',
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
          <ThemedText type="subtitle">Added to Journeys</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            We&apos;re watching {flightNumber} for you.
          </ThemedText>
        </Animated.View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="subtitle" themeColor="heading">
          Add Flight
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
      <ThemedText themeColor="textSecondary">{PROMPTS[step]}</ThemedText>

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
                {formatDayLabel(date)}
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
            {calendarOpen && (
              <ThemedView type="backgroundElement" style={styles.calendar}>
                <DateTimePicker
                  value={today}
                  mode="date"
                  display="inline"
                  presentation="inline"
                  // Claims reach years back; schedules only ~11 months forward.
                  minimumDate={new Date(today.getFullYear() - 3, today.getMonth(), today.getDate())}
                  maximumDate={new Date(today.getFullYear(), today.getMonth() + 11, today.getDate())}
                  accentColor={theme.tint}
                  onValueChange={(_event, picked) => confirmDate(localDateString(picked))}
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
              Tap a chip above to change the flight or day.
            </ThemedText>
          </ThemedView>
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
