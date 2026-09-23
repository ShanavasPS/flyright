import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Connection } from '@/services/connections';
import { cityOf } from '@/services/timeline';
import { flagEmoji } from '@/services/travel-recap';
import type { TripGroup, TripStay } from '@/services/trip-groups';

export function TripGroupHeading({ group, dates }: { group: TripGroup; dates: string }) {
  return (
    <View style={styles.heading} testID={`trip-group-${group.id}`}>
      <View style={styles.title}>
        {!!group.country && <Text style={styles.flag} accessible={false}>{flagEmoji(group.country)}</Text>}
        <ThemedText type="smallBold" themeColor="heading" style={styles.name} accessibilityRole="header">
          {group.title}
        </ThemedText>
      </View>
      {!!dates && <ThemedText type="small" themeColor="textSecondary" style={styles.dates}>{dates}</ThemedText>}
    </View>
  );
}

export function TripStayMark({ stay }: { stay: TripStay }) {
  const theme = useTheme();
  const duration = stay.days === 0 ? 'Less than a day' : `${stay.days} ${stay.days === 1 ? 'day' : 'days'}`;
  return (
    <View style={styles.stay} accessible accessibilityLabel={`Stay: ${duration} in ${stay.place}`} testID={`trip-stay-${stay.id}`}>
      <View style={[styles.shortLine, { backgroundColor: theme.hairline }]} />
      <SymbolView name={{ ios: 'bed.double', android: 'bed', web: 'bed' }} size={16} tintColor={theme.heading} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.stayLabel}>Stay ·</ThemedText>
      <ThemedText type="small" themeColor="heading" style={styles.stayCopy}>
        <ThemedText type="smallBold" themeColor="heading">{duration}</ThemedText> in {stay.place}
      </ThemedText>
      <View style={[styles.shortLine, { backgroundColor: theme.hairline }]} />
    </View>
  );
}

/** Scoped to the Flights list; other live/detail connection surfaces keep
 * their existing layout and labels. */
export function TripConnectionMark({ connection }: { connection: Connection }) {
  const theme = useTheme();
  const label = `${connection.layover} connection in ${cityOf(connection.viaCode)}`;
  return (
    <View style={styles.connection} accessible accessibilityLabel={label}>
      <View style={styles.stem}>
        {[0, 1, 2].map(i => <View key={i} style={[styles.dot, { backgroundColor: theme.textSecondary }]} />)}
      </View>
      <SymbolView name={{ ios: 'clock', android: 'schedule', web: 'schedule' }} size={13} tintColor={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.connectionText}>{label}</ThemedText>
    </View>
  );
}

export function IndependentTripSeparator() {
  const theme = useTheme();
  return <View testID="independent-trip-separator" style={[styles.separator, { backgroundColor: theme.textSecondary }]} />;
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  title: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minWidth: 0 },
  flag: { fontSize: 22, lineHeight: 28 },
  name: { fontSize: 16, flexShrink: 1 },
  dates: { fontSize: 12, lineHeight: 16, textAlign: 'right', maxWidth: '40%', fontVariant: ['tabular-nums'] },
  stay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  shortLine: { width: Spacing.three, flexShrink: 0, height: StyleSheet.hairlineWidth },
  stayLabel: { fontSize: 12, flexShrink: 0 },
  stayCopy: { flexShrink: 1, textAlign: 'center' },
  connection: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingLeft: Spacing.three + 40 + Spacing.two, paddingVertical: Spacing.one },
  connectionText: { fontSize: 12, flexShrink: 1 },
  stem: { gap: 3, alignItems: 'center' },
  dot: { width: 2, height: 2, borderRadius: 1, opacity: 0.6 },
  separator: { height: 1, opacity: 0.35, marginTop: Spacing.four, marginBottom: Spacing.two },
});
