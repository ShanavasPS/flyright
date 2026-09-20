import { useAuth } from '@clerk/expo';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
  type TextInputProps,
  type ScrollViewInstance,
  type ViewInstance,
  type TextInputInstance,
} from 'react-native';

import { DataErrorState, LoadingState, MissingState } from '@/components/data-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useKeyboardOverlap } from '@/hooks/use-keyboard-overlap';
import { useTheme } from '@/hooks/use-theme';
import { HeaderButton } from '@/screens/journey-note';
import { airportZone, getAirport } from '@/services/airports';
import { formatDayLabelWithYear, formatTime } from '@/services/dates';
import { noteSuccess } from '@/services/haptics';
import { updateJourney, useJourney, type JourneyRow, type NewJourneyRow } from '@/services/journeys';
import type { TripCardField } from '@/services/trip-card';
import { boardingInstant, parseClock, typedFields, typedPatch, type RecordRow } from '@/services/trip-record';

type Field = TripCardField;

interface FieldSpec {
  field: Field;
  label: string;
  placeholder: string;
  input: TextInputProps;
}

const CODE: TextInputProps = { autoCapitalize: 'characters', autoCorrect: false };

const DEPARTURE: FieldSpec[] = [
  { field: 'terminal', label: 'Terminal', placeholder: 'e.g. 2', input: CODE },
  { field: 'checkInDesk', label: 'Check-in', placeholder: 'e.g. Area 200 or desks 12–18', input: { autoCorrect: false } },
  { field: 'gate', label: 'Gate', placeholder: 'e.g. 53', input: CODE },
  {
    field: 'boardingTime',
    label: 'Boarding time',
    placeholder: 'e.g. 15:30',
    input: { keyboardType: 'numbers-and-punctuation', autoCorrect: false },
  },
];
const TICKET: FieldSpec[] = [
  { field: 'seat', label: 'Seat', placeholder: 'e.g. 14A', input: CODE },
  { field: 'bookingReference', label: 'Booking reference', placeholder: 'e.g. FRX7YQ', input: CODE },
];
const ARRIVAL: FieldSpec[] = [{ field: 'baggageBelt', label: 'Baggage belt', placeholder: 'e.g. 7', input: CODE }];

/** "Helsinki" for HEL, without the dataset's "(Vantaa)". */
const placeName = (code: string) => getAirport(code)?.city.replace(/\s*\(.*\)$/, '') ?? code;

/** What a field holds now, as the traveller would type it. */
function stored(row: JourneyRow, field: Field): string {
  if (field === 'boardingTime') return row.boardingTime ? formatTime(row.boardingTime, airportZone(row.fromCode)) : '';
  return row[field] ?? '';
}

/** Everything the trip card shows, typed in: the departure airport's
 * terminal, check-in, gate and boarding time, the ticket's seat and
 * booking, and the belt. Opened from a box on the card, with that box's
 * field focused.
 *
 * The keyboard never covers the field being typed in: the form ends at the
 * keyboard's top edge, measured the way the notes editor does it (inside a
 * card modal and under Android's edge-to-edge, KeyboardAvoidingView
 * under-pads), and the focused field is scrolled into what is left. */
export function TripDetailsEdit() {
  const { journeyId, field: focusParam } = useLocalSearchParams<{ journeyId?: string; field?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { userId } = useAuth();
  const { row, loaded, error } = useJourney(journeyId ?? '', userId);

  const contentRef = useRef<ViewInstance | null>(null);
  const { pad: keyboardPad, onLayout: measureContent } = useKeyboardOverlap(contentRef);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const [viewport, setViewport] = useState(0);
  // Where each field sits inside its group, and each group in the scroll
  // content — layouts arrive in no set order, so they are added up late.
  const frames = useRef<Partial<Record<Field, { group: string; y: number; height: number }>>>({});
  const groupOffsets = useRef<Record<string, number>>({});
  const inputs = useRef<Partial<Record<Field, TextInputInstance | null>>>({});
  const [focused, setFocused] = useState<Field | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<Field, string>>>({});

  // Keep the focused field inside the part of the form the keyboard leaves
  // visible — on focus, and again once the keyboard has taken its room.
  useEffect(() => {
    if (!focused || !viewport) return;
    const frame = frames.current[focused];
    if (!frame) return;
    const y = (groupOffsets.current[frame.group] ?? 0) + frame.y;
    const margin = Spacing.four;
    const top = y - margin;
    const bottom = y + frame.height + margin;
    if (top < scrollY.current) {
      scrollRef.current?.scrollTo({ y: Math.max(0, top), animated: true });
    } else if (bottom > scrollY.current + viewport) {
      scrollRef.current?.scrollTo({ y: bottom - viewport, animated: true });
    }
  }, [focused, viewport, keyboardPad]);

  if (error || !loaded || !row) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Trip details',
            headerTitleAlign: 'center',
            headerLeft: () => <HeaderButton label="Cancel" onPress={() => router.back()} />,
          }}
        />
        {error ? (
          <DataErrorState error={error} title="Couldn't read this trip" />
        ) : !loaded ? (
          <LoadingState />
        ) : (
          <MissingState
            title="This trip isn't in your journal"
            detail="It may have been removed on another device, or the link is out of date."
          />
        )}
      </ThemedView>
    );
  }

  const flight = row.mode === 'flight';
  const groups: { title: string; specs: FieldSpec[] }[] = flight
    ? [
        { title: `From ${placeName(row.fromCode)} · ${row.fromCode}`, specs: DEPARTURE },
        { title: 'Your ticket', specs: TICKET },
        { title: `Into ${placeName(row.toCode)} · ${row.toCode}`, specs: ARRIVAL },
      ]
    : [{ title: 'Your ticket', specs: TICKET }];
  const order = groups.flatMap((group) => group.specs.map((spec) => spec.field));
  const initialFocus = order.includes(focusParam as Field) ? (focusParam as Field) : order[0];

  const valueOf = (field: Field) => drafts[field] ?? stored(row, field);
  const changed = order.filter((field) => drafts[field] != null && drafts[field]!.trim() !== stored(row, field));
  const dirty = changed.length > 0;
  const typed = typedFields(row);

  const save = async () => {
    if (!dirty) return;
    let record: RecordRow = row;
    const patch: Partial<NewJourneyRow> = {};
    for (const field of changed) {
      const text = drafts[field]!.trim();
      if (field === 'seat' || field === 'bookingReference') {
        patch[field] = text ? text.toUpperCase() : null;
        continue;
      }
      let value: string | null = text || null;
      if (field === 'boardingTime' && text) {
        const minutes = parseClock(text);
        value = minutes == null ? null : boardingInstant(row, minutes);
        if (!value) {
          Alert.alert('Boarding time', 'Enter the time as it reads on your boarding pass, like 15:30.');
          inputs.current.boardingTime?.focus();
          return;
        }
      } else if (value && field !== 'checkInDesk') {
        value = value.toUpperCase();
      }
      const next = typedPatch(record, field, value);
      record = { ...record, ...next };
      Object.assign(patch, next);
    }
    await updateJourney(row.id, patch);
    noteSuccess();
    router.back();
  };

  const cancel = () => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert('Discard your changes?', undefined, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const tripLine = [row.number, `${row.fromCode} → ${row.toCode}`, formatDayLabelWithYear(row.scheduledDeparture, airportZone(row.fromCode))]
    .filter(Boolean)
    .join(' · ');

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Trip details',
          headerTitleAlign: 'center',
          headerLeft: () => <HeaderButton label="Cancel" onPress={cancel} />,
          headerRight: () => <HeaderButton label="Save" bold disabled={!dirty} onPress={save} />,
        }}
      />
      <View ref={contentRef} onLayout={measureContent} style={[styles.frame, { paddingBottom: keyboardPad }]}>
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          onLayout={(e) => setViewport(e.nativeEvent.layout.height)}
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={32}
          contentContainerStyle={styles.content}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {tripLine}
          </ThemedText>
          {groups.map((group) => (
            <View
              key={group.title}
              style={styles.group}
              onLayout={(e) => {
                groupOffsets.current[group.title] = e.nativeEvent.layout.y;
              }}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.groupTitle}>
                {group.title.toUpperCase()}
              </ThemedText>
              {group.specs.map((spec) => {
                const index = order.indexOf(spec.field);
                const last = index === order.length - 1;
                const airportPosted =
                  spec.field !== 'seat' &&
                  spec.field !== 'bookingReference' &&
                  !!row[spec.field] &&
                  !typed.has(spec.field);
                return (
                  <View
                    key={spec.field}
                    style={styles.field}
                    onLayout={(e: LayoutChangeEvent) => {
                      const { y, height } = e.nativeEvent.layout;
                      frames.current[spec.field] = { group: group.title, y, height };
                    }}>
                    <ThemedText type="smallBold" themeColor="heading">
                      {spec.label}
                    </ThemedText>
                    <TextInput
                      ref={(input) => {
                        inputs.current[spec.field] = input;
                      }}
                      testID={`trip-details-${spec.field}`}
                      autoFocus={spec.field === initialFocus}
                      value={valueOf(spec.field)}
                      onChangeText={(text) => setDrafts((prev) => ({ ...prev, [spec.field]: text }))}
                      onFocus={() => setFocused(spec.field)}
                      placeholder={spec.placeholder}
                      placeholderTextColor={theme.textSecondary}
                      returnKeyType={last ? 'done' : 'next'}
                      submitBehavior={last ? 'blurAndSubmit' : 'submit'}
                      onSubmitEditing={() => (last ? void save() : inputs.current[order[index + 1]]?.focus())}
                      style={[
                        styles.input,
                        { color: theme.text, backgroundColor: theme.field, borderColor: focused === spec.field ? theme.tint : theme.hairline },
                      ]}
                      {...spec.input}
                    />
                    {airportPosted && (
                      <ThemedText type="small" themeColor="textSecondary">
                        Posted by the airport. What you type replaces it until the airport posts again.
                      </ThemedText>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  frame: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
  },
  group: {
    gap: Spacing.three,
  },
  groupTitle: {
    fontSize: 12,
    letterSpacing: 1,
  },
  field: {
    gap: Spacing.one + Spacing.half,
  },
  input: {
    fontSize: 17,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
  },
});
