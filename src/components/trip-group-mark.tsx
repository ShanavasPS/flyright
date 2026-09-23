import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Connection } from '@/services/connections';
import { cityOf } from '@/services/timeline';
import { flagEmoji } from '@/services/travel-recap';
import type { TripGroup, TripStay } from '@/services/trip-groups';

/** Join the virtualized rows into one filled trip container. Each flight keeps
 * its own list key and measured position for live-card shortcuts and scrolling. */
export function TripGroupFrame({ children, header, first, last }: {
  children: ReactNode;
  header?: boolean;
  first?: boolean;
  last?: boolean;
}) {
  const theme = useTheme();
  const backgroundColor = header ? theme.backgroundSelected : theme.field;
  return (
    <View style={[
      styles.frame,
      header ? styles.frameHeader : styles.frameBody,
      first && styles.frameFirst,
      last && styles.frameLast,
      { backgroundColor, borderColor: theme.hairline },
    ]}>
      {children}
      {/* Android slightly insets a rounded background's flat edges too.
          Fill that join so adjacent cells cannot expose a hairline seam. */}
      {(header || last) && <View pointerEvents="none" style={[
        styles.joinFill,
        header ? styles.joinBottom : styles.joinTop,
        { backgroundColor },
      ]} />}
    </View>
  );
}

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

const styles = StyleSheet.create({
  frame: {
    marginHorizontal: -Spacing.two,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    // Include the border in the 8-point inset, preserving flight-card width.
    paddingHorizontal: Spacing.two - 1,
  },
  frameHeader: {
    borderTopWidth: 1,
    borderTopLeftRadius: Spacing.three,
    borderTopRightRadius: Spacing.three,
    paddingTop: Spacing.two + Spacing.one - 1,
    paddingBottom: Spacing.two + Spacing.one,
  },
  // Keep the gap with the preceding card so its shadow has room to fade.
  frameBody: { paddingBottom: Spacing.one },
  frameFirst: { paddingTop: Spacing.two + Spacing.one },
  frameLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: Spacing.three,
    borderBottomRightRadius: Spacing.three,
    paddingBottom: Spacing.two - 1,
    marginBottom: Spacing.two + Spacing.one,
  },
  joinFill: { position: 'absolute', left: 1, right: 1, height: 1 },
  joinTop: { top: 0 },
  joinBottom: { bottom: 0 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
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
});
