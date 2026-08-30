import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  COBALT,
  NIGHT_SKY,
  WHITE,
  WHITE_DIM,
  WHITE_FAINT,
} from '@/components/travel-stats-header';
import { Spacing } from '@/constants/theme';

/** Amber for delay accents on the night sky — same value the travel-day
 * banner and the Live Activity use. */
export const PASS_AMBER = '#F2B441';

/**
 * Night-sky boarding-pass primitives for the add-flight sheet — the same
 * card language as the travel-day hero and the Live Activity, so the flight
 * someone adds looks like the pass they'll travel with. The hero keeps its
 * own animated implementation; these are the static building blocks.
 */
export function PassCard({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[styles.card, { experimental_backgroundImage: NIGHT_SKY }, style]}>
      {children}
    </View>
  );
}

/** Kerned all-caps caption — the boarding-pass field label. */
export function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <ThemedText type="smallBold" style={styles.microLabel}>
      {children}
    </ThemedText>
  );
}

/** Big route codes pinned to opposite edges, times beneath, the dotted
 * contrail with the plane mid-path between — the app's signature row.
 * Accessible as one label ("HEL → LHR") since the codes are split views. */
export function PassRouteRow({
  fromCode,
  toCode,
  depTime,
  arrTime,
  delayed = false,
}: {
  fromCode: string;
  toCode: string;
  depTime?: string | null;
  arrTime?: string | null;
  delayed?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${fromCode} → ${toCode}`}
      style={styles.routeRow}>
      <View style={styles.endpoint}>
        <Text style={styles.code} numberOfLines={1}>
          {fromCode}
        </Text>
        {!!depTime && <Text style={styles.codeTime}>{depTime}</Text>}
      </View>
      <View style={[styles.routePath, (depTime || arrTime) ? styles.routePathLifted : null]}>
        <View style={styles.routeEndDot} />
        <Dots />
        <SymbolView
          name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
          size={16}
          tintColor={delayed ? PASS_AMBER : COBALT}
          style={Platform.OS === 'ios' ? undefined : styles.rotated}
        />
        <Dots />
        <View style={styles.routeEndDot} />
      </View>
      <View style={[styles.endpoint, styles.endpointRight]}>
        <Text style={styles.code} numberOfLines={1}>
          {toCode}
        </Text>
        {!!arrTime && <Text style={styles.codeTime}>{arrTime}</Text>}
      </View>
    </View>
  );
}

function Dots() {
  return (
    <View style={styles.routeDots}>
      {Array.from({ length: 3 }, (_, i) => (
        <View key={i} style={styles.routeDot} />
      ))}
    </View>
  );
}

/** The tear-off perforation between the pass body and its action stub. */
export function PassDivider() {
  return <View style={styles.perforation} />;
}

/** The pass's one loud element: a white pill with navy text — the same
 * white-chip-on-navy accent the Live Activity's airline monogram wears. */
export function PassAction({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.action, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    borderWidth: 1,
    borderColor: 'rgba(242,246,251,0.08)',
    shadowColor: '#0B1520',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  microLabel: {
    color: WHITE_DIM,
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  endpoint: {
    gap: Spacing.half,
  },
  endpointRight: {
    alignItems: 'flex-end',
  },
  code: {
    color: WHITE,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: 700,
    letterSpacing: 1,
  },
  codeTime: {
    color: WHITE_DIM,
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  routePath: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  // With times under the codes, center the path on the codes' midline
  // instead of the whole endpoint block (same trick as the hero).
  routePathLifted: {
    marginBottom: 20,
  },
  routeDots: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  routeDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: WHITE_DIM,
    opacity: 0.55,
  },
  routeEndDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: WHITE_DIM,
  },
  rotated: {
    transform: [{ rotate: '90deg' }],
  },
  perforation: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: WHITE_FAINT,
  },
  action: {
    alignItems: 'center',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    backgroundColor: WHITE,
  },
  actionLabel: {
    color: '#0C1B36',
    fontSize: 16,
    fontWeight: 700,
  },
});
