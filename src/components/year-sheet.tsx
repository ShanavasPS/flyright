import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { YearWheel } from '@/components/year-wheel';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { yearChoices } from '@/services/year-choice';

export type YearRequest = { date: string; onPick: (year: number) => void };

/** "Which year?" as a bottom card with a wheel: the year is the one part of
 * a scanned or months-old date the app had to guess, and a wheel lets the
 * traveller land on any year — not a shortlist. Done commits; the backdrop
 * cancels. Render once per screen, drive it with `request`. */
export function YearSheet({
  request,
  today,
  onClose,
}: {
  request: YearRequest | null;
  today: Date;
  onClose: () => void;
}) {
  // Keyed on the request so a fresh open starts from the date's own year.
  return request ? (
    <YearSheetBody key={request.date} request={request} today={today} onClose={onClose} />
  ) : null;
}

function YearSheetBody({
  request,
  today,
  onClose,
}: {
  request: YearRequest;
  today: Date;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const years = yearChoices(request.date, today);
  const [year, setYear] = useState(Number(request.date.slice(0, 4)));
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* The backdrop is a sibling of the card, not its parent: a card nested
          in a Pressable never got to scroll its wheel on Android — the press
          claimed the gesture first. */}
      <View style={styles.sheet}>
        <Pressable accessibilityLabel="Cancel" onPress={onClose} style={styles.backdrop} />
        <View
          style={[
            styles.card,
            { backgroundColor: theme.backgroundElement, paddingBottom: insets.bottom + Spacing.three },
          ]}>
          <ThemedText type="subtitle" themeColor="heading" style={styles.title}>
            Which year?
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.title}>
            Barcodes carry no year, and a receipt read months later can land a trip a year
            out. Spin to the one you flew.
          </ThemedText>
          <YearWheel value={year} years={years} onChange={setYear} />
          <View style={styles.cta}>
            <PrimaryButton
              label={`Use ${year}`}
              onPress={() => {
                onClose();
                request.onPick(year);
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    borderTopLeftRadius: Spacing.five,
    borderTopRightRadius: Spacing.five,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    textAlign: 'center',
  },
  cta: {
    paddingTop: Spacing.one,
  },
});
