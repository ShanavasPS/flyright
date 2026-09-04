import { useAuth } from '@clerk/expo';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
  const row = useJourney(journeyId ?? '', userId);
  const androidPad = useAndroidKeyboardHeight();

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
    ? [row.number, `${row.fromCode} → ${row.toCode}`, formatDayLabelWithYear(row.scheduledDeparture)]
        .filter(Boolean)
        .join(' · ')
    : '';

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
      {/* iOS: KeyboardAvoidingView shrinks the editor above the keyboard.
          Android 15 edge-to-edge: adjustResize is dead and KAV under-pads, so
          the measured keyboard height pads the editor instead. */}
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 56 : 0}>
        <View style={[styles.content, { paddingBottom: Spacing.four + androidPad }]}>
          {tripLine ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {tripLine}
            </ThemedText>
          ) : null}
          <TextInput
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
      </KeyboardAvoidingView>
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

/** Android only: the keyboard's height while it is up, re-read on every show
 * (the suggestion strip changes it); 0 when hidden and on iOS. */
function useAndroidKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
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
