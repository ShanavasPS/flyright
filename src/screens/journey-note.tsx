import { useAuth } from '@clerk/expo';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  Alert,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { DataErrorState, LoadingState, MissingState } from '@/components/data-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { formatDayLabelWithYear } from '@/services/dates';
import { noteSuccess } from '@/services/haptics';
import { saveJourneyNotes, useJourney } from '@/services/journeys';

/** The journal's free-text field, full screen: one big text area with Cancel
 * and Save in the header, so the keyboard can take as much of the screen as
 * it likes without burying a button. Opened from the trip detail's notes. */
export function JourneyNote() {
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { userId } = useAuth();
  const { row, loaded, error } = useJourney(journeyId ?? '', userId);
  const contentRef = useRef<View | null>(null);
  const { pad: keyboardPad, onLayout: measureContent } = useKeyboardOverlap(contentRef);

  // Unset until the traveler types, so the stored note shows through as the
  // initial value once the row loads instead of flashing empty.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? row?.notes ?? '';
  const dirty = draft != null && draft.trim() !== (row?.notes ?? '');

  const save = async () => {
    if (!row || !dirty) return;
    await saveJourneyNotes(row.id, value);
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

  const tripLine = row
    ? [row.number, `${row.fromCode} → ${row.toCode}`, formatDayLabelWithYear(row.scheduledDeparture, airportZone(row.fromCode))]
        .filter(Boolean)
        .join(' · ')
    : '';

  // The editor autofocuses, so it must not mount before the stored note is
  // in hand: a word typed into the empty frame would become the draft and
  // shadow the real note for good (value = draft ?? row.notes).
  if (error || !loaded || !row) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Trip notes',
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

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Trip notes',
          // Android left-aligns titles by default, which ran "Cancel" straight
          // into the title; a Cancel/Save header reads as a dialog, centred.
          headerTitleAlign: 'center',
          headerLeft: () => <HeaderButton label="Cancel" onPress={cancel} />,
          headerRight: () => <HeaderButton label="Save" bold disabled={!dirty} onPress={save} />,
        }}
      />
      {/* The editor shrinks to end exactly at the keyboard's top edge, by
          measuring rather than trusting KeyboardAvoidingView: inside this
          card modal KAV under-pads on iOS (the editor kept running under the
          keyboard, so the caret vanished and typing "stopped"), and on
          Android 15 edge-to-edge adjustResize is dead and KAV under-pads too.
          With its bottom above the keyboard the text view scrolls to keep the
          caret in view on its own. */}
      <View
        ref={contentRef}
        onLayout={measureContent}
        style={[styles.content, { paddingBottom: Spacing.four + keyboardPad }]}>
        {tripLine ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {tripLine}
          </ThemedText>
        ) : null}
        <TextInput
          testID="trip-note-editor"
          autoFocus
          multiline
          scrollEnabled
          value={value}
          onChangeText={setDraft}
          placeholder="How was the trip? Who you were with, where you sat, the food, what you'd do differently…"
          placeholderTextColor={theme.textSecondary}
          textAlignVertical="top"
          style={[styles.editor, { color: theme.text }]}
        />
      </View>
    </ThemedView>
  );
}

function HeaderButton({
  label,
  bold,
  disabled,
  onPress,
}: {
  label: string;
  bold?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={Spacing.two}
      onPress={onPress}
      style={({ pressed }) => [styles.headerButton, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}>
      <ThemedText type={bold ? 'smallBold' : 'small'} style={[styles.headerLabel, { color: theme.tint }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** How far the editor's bottom edge must rise to meet the keyboard's top
 * edge, both in window coordinates — so it holds inside a card modal, under
 * Android edge-to-edge, and with the suggestion strip toggling. The padded
 * view's own frame doesn't move (padding shrinks its content), so the pad is
 * simply frame-bottom minus keyboard-top, recomputed whenever either side
 * changes: keyboard frame events on one side, the view's layout on the other.
 * The layout hook matters because autoFocus raises the keyboard before the
 * first layout, when a measurement would read zeros. */
function useKeyboardOverlap(content: RefObject<View | null>) {
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [bottom, setBottom] = useState<number | null>(null);

  const measure = () => {
    content.current?.measureInWindow((_x, y, _w, h) => {
      if (h > 0) setBottom(y + h);
    });
  };

  useEffect(() => {
    // iOS fires will-change-frame in step with the animation (and for the
    // suggestion strip / emoji keyboard); Android only has did-show.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      setKeyboardTop(e.endCoordinates.screenY);
      measure();
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardTop(null));
    return () => {
      show.remove();
      hide.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  // iPhone: inside a card modal, measureInWindow answers relative to the
  // modal's own view (72pt short on an iPhone 16 Pro — two lines of text
  // under the keyboard), while the keyboard's top is in screen coordinates.
  // The card is flush with the screen bottom, so the window's height IS the
  // editor's bottom edge there. iPad's floating sheet and Android keep the
  // measurement (UIKit lifts the iPad sheet above the keyboard itself).
  const edge = Platform.OS === 'ios' && !Platform.isPad ? Dimensions.get('window').height : bottom;
  const pad = keyboardTop != null && edge != null ? Math.max(0, edge - keyboardTop) : 0;
  return { pad, onLayout: measure };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  editor: {
    flex: 1,
    fontSize: 17,
    lineHeight: 26,
    paddingTop: 0,
    paddingHorizontal: 0,
  },
  // Android's header gives headerLeft/Right no inset of their own.
  headerButton: {
    paddingHorizontal: Platform.OS === 'android' ? Spacing.two : 0,
  },
  headerLabel: {
    fontSize: 17,
    lineHeight: 22,
  },
});
