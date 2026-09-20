import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AirlineLogo } from '@/components/airline-logo';
import { ThemedText } from '@/components/themed-text';
import { searchCarriers } from '@/constants/carriers';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface PickedAirline {
  iata: string;
  name: string;
  country: string;
}

/** The airline search as its own sheet: the field pinned to the top and the
 * matches directly under it, so the keyboard can only ever cover the far end
 * of a list that scrolls — never the first results, which is what an inline
 * search in the middle of a form does. Every carrier is listed A–Z until the
 * traveller types, so the sheet also works as a browse. */
export function AirlineSheet({
  visible,
  selected,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** IATA code of the airline currently on the trip, ticked in the list. */
  selected?: string | null;
  onPick: (airline: PickedAirline) => void;
  onClose: () => void;
}) {
  return visible ? <AirlineSheetBody selected={selected} onPick={onPick} onClose={onClose} /> : null;
}

function AirlineSheetBody({
  selected,
  onPick,
  onClose,
}: {
  selected?: string | null;
  onPick: (airline: PickedAirline) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInputInstance>(null);
  const keyboardHeight = useKeyboardHeight();
  const matches = searchCarriers(query);
  // A page sheet on iOS starts below the status bar by itself; Android's
  // full-screen modal draws under it.
  const paddingTop = Platform.OS === 'ios' ? Spacing.four : insets.top + Spacing.three;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      statusBarTranslucent
      // Android ignores autoFocus inside a Modal — the window isn't focused
      // yet when the field mounts — so the keyboard is asked for once it is.
      onShow={() => {
        if (Platform.OS === 'android') setTimeout(() => inputRef.current?.focus(), 100);
      }}
      onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: theme.background, paddingTop }]}>
        <View style={styles.header}>
          <ThemedText type="subtitle" themeColor="heading">
            Choose an airline
          </ThemedText>
          <Pressable accessibilityLabel="Close" hitSlop={Spacing.three} onPress={onClose}>
            <ThemedText themeColor="textSecondary" style={styles.close}>
              ✕
            </ThemedText>
          </Pressable>
        </View>
        <View style={[styles.field, { backgroundColor: theme.field }]}>
          <SymbolView
            name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
            size={16}
            tintColor={theme.textSecondary}
          />
          <TextInput
            ref={inputRef}
            autoFocus={Platform.OS !== 'android'}
            autoCorrect={false}
            value={query}
            onChangeText={setQuery}
            placeholder="Airline name or code"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="search"
            clearButtonMode="while-editing"
            testID="manual-airline-search"
            style={[styles.input, { color: theme.text }]}
          />
        </View>
        <FlatList
          data={matches}
          keyExtractor={([code]) => code}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            paddingBottom: Math.max(keyboardHeight, insets.bottom) + Spacing.four,
          }}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              No airline we know matches “{query.trim()}”. The trip keeps the airline from its
              flight number.
            </ThemedText>
          }
          renderItem={({ item: [code, carrier] }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${carrier.name}, ${code}`}
              testID={`airline-${code}`}
              onPress={() => onPick({ iata: code, ...carrier })}
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
              <AirlineLogo number={code} carrier={carrier.name} size={36} />
              <View
                style={[styles.rowBody, { borderBottomColor: `${theme.textSecondary}33` }]}>
                <View style={styles.rowText}>
                  <ThemedText type="smallBold">{carrier.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {code}
                  </ThemedText>
                </View>
                {code === selected && (
                  <SymbolView
                    name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                    size={16}
                    weight="semibold"
                    tintColor={theme.tint}
                  />
                )}
              </View>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

/** Height of the open keyboard, 0 when closed. The list pads itself by it:
 * iOS doesn't inset a list inside a Modal, and Android's adjustResize is dead
 * under edge-to-edge. */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => setHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  close: {
    fontSize: 22,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  input: {
    flex: 1,
    fontSize: 17,
    paddingVertical: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  empty: {
    paddingVertical: Spacing.four,
    textAlign: 'center',
  },
});
