import { StyleSheet, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Home's shape while it is still finding out what to say: a section label
 * and two postcards, one words-only and one with a photo, each block on the
 * real FeedCard's footprint (border, radius, 32pt face, padding).
 *
 * Until the session is restored and the first reads are back, Home cannot
 * know whether it has a travel day, a feed or nothing yet — and guessing
 * showed "Sign in", then "Add a flight", then the postcards on every cold
 * start. One neutral shape instead, then the real screen. Static like
 * JournalSkeleton: the wait is short and a shimmer would draw the eye. */
export function HomeSkeleton() {
  const theme = useTheme();
  return (
    <View
      style={styles.fill}
      accessible
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      testID="home-skeleton">
      <ThemedView type="backgroundSelected" style={styles.label} />
      {[false, true].map((photo) => (
        <View key={String(photo)} style={[styles.card, { borderColor: theme.hairline }]}>
          <View style={styles.header}>
            <ThemedView type="backgroundSelected" style={styles.face} />
            <View style={styles.lines}>
              <ThemedView type="backgroundSelected" style={[styles.bar, styles.name]} />
              <ThemedView type="backgroundElement" style={[styles.bar, styles.meta]} />
            </View>
            <ThemedView type="backgroundElement" style={styles.heart} />
          </View>
          {photo && <ThemedView type="backgroundElement" style={styles.photo} />}
          <View style={styles.text}>
            <ThemedView type="backgroundSelected" style={[styles.bar, styles.words]} />
            {!photo && <ThemedView type="backgroundSelected" style={[styles.bar, styles.wordsShort]} />}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { gap: Spacing.three },
  // Home's "POSTCARDS" micro label.
  label: { width: 88, height: 10, borderRadius: 5, marginTop: Spacing.one },
  // FeedCard: bordered, rounded, header row then the words.
  card: { borderWidth: 1, borderRadius: Spacing.three + 2, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two + Spacing.one,
  },
  face: { width: 32, height: 32, borderRadius: 16 },
  lines: { flex: 1, gap: Spacing.one + Spacing.half },
  bar: { height: 8, borderRadius: 4 },
  name: { width: '40%', height: 10, borderRadius: 5 },
  meta: { width: '70%' },
  heart: { width: 44, height: 30, borderRadius: 15 },
  photo: { height: 180 },
  text: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two + Spacing.one,
    paddingBottom: Spacing.three,
  },
  words: { width: '82%', height: 10, borderRadius: 5 },
  wordsShort: { width: '36%', height: 10, borderRadius: 5 },
});
