import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { NIGHT_SKY, WHITE_FAINT } from '@/components/travel-stats-header';
import { Spacing } from '@/constants/theme';

/** How many ghost rows stand in for the list. Three fills a phone screen
 * under the hero without the last one being cut mid-card. */
const GHOST_ROWS = 3;

/** The home screen's shape while the journal is still being read: the
 * all-time stats hero in its navy, a section label, then trip rows with a
 * logo tile and three lines. Every block is the real component's footprint
 * (same padding, radius and row height), so nothing shifts when the rows
 * land — the bars simply become words.
 *
 * Shown for the beat between mount and the first read for the signed-in
 * user, which on a cold start includes Clerk restoring the session. Static
 * on purpose: the wait is well under a second, and a shimmer would draw the
 * eye to it. */
export function JournalSkeleton() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.list}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      accessible
      accessibilityLabel="Loading your travels"
      accessibilityRole="progressbar"
      testID="journal-skeleton">
      <View style={[styles.hero, { experimental_backgroundImage: NIGHT_SKY }]}>
        <View style={[styles.heroBar, styles.heroEyebrow]} />
        <View style={styles.statsRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.stat}>
              <View style={[styles.heroBar, styles.statLabel]} />
              <View style={[styles.heroBar, styles.statValue]} />
            </View>
          ))}
        </View>
      </View>
      <ThemedView type="backgroundSelected" style={styles.sectionTitle} />
      {Array.from({ length: GHOST_ROWS }, (_, i) => (
        <ThemedView key={i} type="backgroundElement" style={styles.row}>
          <ThemedView type="backgroundSelected" style={styles.logo} />
          <View style={styles.body}>
            <View style={styles.spacedRow}>
              <ThemedView type="backgroundSelected" style={[styles.bar, styles.barMeta]} />
              <ThemedView type="backgroundSelected" style={styles.chip} />
            </View>
            <ThemedView type="backgroundSelected" style={[styles.bar, styles.barRoute]} />
            <ThemedView type="backgroundSelected" style={[styles.bar, styles.barSchedule]} />
          </View>
        </ThemedView>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Mirrors the journeys screen's list container.
  list: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  // TravelStatsHeader's card: the eyebrow line, then three stats side by side.
  hero: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    borderWidth: 1,
    borderColor: 'rgba(242,246,251,0.08)',
  },
  heroBar: {
    borderRadius: 4,
    backgroundColor: WHITE_FAINT,
  },
  heroEyebrow: {
    width: '38%',
    height: 10,
  },
  statsRow: {
    flexDirection: 'row',
  },
  stat: {
    flex: 1,
    gap: Spacing.one,
  },
  statLabel: {
    width: '55%',
    height: 8,
  },
  statValue: {
    width: '70%',
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(242,246,251,0.28)',
  },
  // The "UPCOMING" / "PAST" label above a group of rows.
  sectionTitle: {
    width: 72,
    height: 10,
    borderRadius: 5,
    marginTop: Spacing.two,
  },
  // TripRow's SheenCard: 40pt logo tile beside meta / cities / times.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: Spacing.two,
  },
  body: {
    flex: 1,
    gap: Spacing.one + Spacing.half,
  },
  spacedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bar: {
    height: 8,
    borderRadius: 4,
  },
  barMeta: {
    width: '44%',
  },
  barRoute: {
    width: '78%',
    height: 10,
    borderRadius: 5,
  },
  barSchedule: {
    width: '60%',
  },
  chip: {
    width: 40,
    height: 8,
    borderRadius: 4,
  },
});
