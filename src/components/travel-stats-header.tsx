import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLargeText } from '@/hooks/use-text-scale';
import { formatKm, timeAloftComparison, type TravelStats } from '@/services/timeline';

// The card keeps the brand's night-flight navy in BOTH themes — on the light
// porcelain page it reads as the one premium object on screen, in dark mode
// the gradient lifts it just above the flat card surfaces. Text colors are
// therefore fixed (white on navy), not theme tokens. Exported so the travel
// day hero can share the exact same treatment (one hero, one palette).
export const NIGHT_SKY = 'linear-gradient(150deg, #1C3459 0%, #0C1B36 62%, #091530 100%)';
export const WHITE = '#F2F6FB';
export const WHITE_DIM = 'rgba(242,246,251,0.62)';
export const WHITE_FAINT = 'rgba(242,246,251,0.16)';
export const COBALT = '#7FB1F2';

// The summary card's right edge: clear into a cobalt glow behind its chevron.
const EDGE_GLOW =
  'linear-gradient(90deg, rgba(61,134,245,0) 0%, rgba(61,134,245,0.16) 55%, rgba(61,134,245,0.32) 100%)';
const EDGE_WIDTH = 60;

/** The rewarding little flex at the top of My travels — a passport-style
 * navy card that opens the full Travel stats screen. Renders nothing until
 * there's at least one trip. Signed-out users get the backup pitch — the
 * trips they just logged are the reason to make an account. */
export function TravelStatsHeader({ stats }: { stats: TravelStats }) {
  const router = useRouter();

  if (!stats.trips) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open your travel stats"
      onPress={() => router.push('/stats')}
      style={({ pressed }) => pressed && styles.pressed}>
      <View style={[styles.card, styles.cardWithEdge, { experimental_backgroundImage: NIGHT_SKY }]}>
        <TravelStatsBody stats={stats} />
        {/* The way in to Travel stats: a cobalt-lit edge with the chevron,
            instead of a footer row under the figures. */}
        <View style={[styles.edge, { experimental_backgroundImage: EDGE_GLOW }]}>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            // Material's glyph sits in more padding and has no weight to raise.
            size={Platform.OS === 'ios' ? 18 : 26}
            weight="semibold"
            tintColor={WHITE}
          />
        </View>
      </View>
    </Pressable>
  );
}

/** The all-time figures in one line — what the stats card shrinks to on a
 * travel day, when the live flight takes the top of the screen. It keeps the
 * navy: the summary card wears the same colour every day of the year, so
 * the reader always knows which card is "my travels so far" and which is
 * today's flight. Still the door to Travel stats. Renders nothing until
 * there's at least one trip. */
export function TravelStatsStrip({ stats }: { stats: TravelStats }) {
  const router = useRouter();
  const large = useLargeText();

  if (!stats.trips) return null;
  const line = [
    `${stats.trips.toLocaleString()} ${stats.trips === 1 ? 'trip' : 'trips'}`,
    `${formatKm(stats.totalKm)} km`,
    `${stats.countries.toLocaleString()} ${stats.countries === 1 ? 'country' : 'countries'}`,
  ].join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open your travel stats. All-time: ${line}`}
      onPress={() => router.push('/stats')}
      style={({ pressed }) => pressed && styles.pressed}>
      <View style={[styles.card, styles.strip, { experimental_backgroundImage: NIGHT_SKY }]}>
        <View style={styles.stripText}>
          <ThemedText type="smallBold" style={styles.microLabel}>
            All-time
          </ThemedText>
          {/* Large text: two lines rather than "11 count..". */}
          <ThemedText type="smallBold" style={styles.stripLine} numberOfLines={large ? 2 : 1}>
            {line}
          </ThemedText>
        </View>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={13}
          tintColor={WHITE_DIM}
        />
      </View>
    </Pressable>
  );
}

/** The card's contents without the navy card itself. Assumes stats.trips > 0. */
export function TravelStatsBody({ stats }: { stats: TravelStats }) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const aloft = timeAloftComparison(stats.hoursAloft);
  const large = useLargeText();

  return (
    <View style={styles.statsBody}>
        <View style={styles.spacedRow}>
          <ThemedText type="smallBold" style={styles.microLabel}>
            All-time
          </ThemedText>
          <MiniContrail />
        </View>

        {/* Large text: three columns can't hold "COUNTRIES" (it broke as
            "COUNTRIE/S" into "KM FLOWN"), so the stats stack. */}
        <View style={large ? styles.statsStack : styles.statsRow}>
          <Stat stacked={large} label={stats.trips === 1 ? 'trip' : 'trips'} value={stats.trips.toLocaleString()} />
          <Stat stacked={large} align="center" label="km flown" value={formatKm(stats.totalKm)} />
          <Stat
            stacked={large}
            align="right"
            label={stats.countries === 1 ? 'country' : 'countries'}
            value={stats.countries.toLocaleString()}
          />
        </View>
        {aloft && (
          <ThemedText type="small" style={styles.aloft}>
            That&apos;s {stats.hoursEstimated ? 'about ' : ''}
            {aloft}
          </ThemedText>
        )}

        {isLoaded && !isSignedIn && (
          <Pressable
            accessibilityRole="button"
            hitSlop={Spacing.two}
            onPress={() => router.push('/sign-in')}>
            <ThemedText type="small" style={styles.cta}>
              Keep your history safe across devices —{' '}
              <ThemedText type="small" style={styles.ctaLink}>
                Sign{' '}in
              </ThemedText>
            </ThemedText>
          </Pressable>
        )}
    </View>
  );
}

/** Left / center / right columns so the row spans the full card width. */
function Stat({
  value,
  label,
  align = 'left',
  stacked = false,
}: {
  value: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  /** One stat per line: label left, value right. */
  stacked?: boolean;
}) {
  const alignItems = align === 'left' ? 'flex-start' : align === 'center' ? 'center' : 'flex-end';
  if (stacked) {
    return (
      <View style={styles.statStacked}>
        <ThemedText type="smallBold" style={[styles.statLabel, styles.statLabelStacked]}>
          {label}
        </ThemedText>
        <ThemedText style={styles.statValue}>{value}</ThemedText>
      </View>
    );
  }
  return (
    <View style={[styles.stat, { alignItems }]}>
      <ThemedText type="smallBold" style={styles.statLabel}>
        {label}
      </ThemedText>
      <ThemedText style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </ThemedText>
    </View>
  );
}

/** Tiny echo of the record cards' dotted contrail — pure ornament. */
export function MiniContrail() {
  return (
    <View style={styles.contrail}>
      {Array.from({ length: 5 }, (_, i) => (
        <View key={i} style={styles.dot} />
      ))}
      <SymbolView
        name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
        size={13}
        tintColor={WHITE_DIM}
        style={Platform.OS === 'ios' ? undefined : styles.rotated}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.9,
  },
  // Same vertical rhythm the card used to own, so the body reads identically
  // whether it lives in its own card or inside the travel-day hero.
  statsBody: {
    gap: Spacing.three,
  },
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
  // Room on the right for the edge, so the COUNTRIES column ends before it.
  cardWithEdge: {
    paddingRight: EDGE_WIDTH + Spacing.two,
  },
  // Rounded itself rather than clipped by the card: overflow hidden would
  // take the card's iOS shadow with it.
  edge: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: EDGE_WIDTH,
    borderTopRightRadius: Spacing.four - 1,
    borderBottomRightRadius: Spacing.four - 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: Spacing.two,
  },
  spacedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  stripText: {
    flex: 1,
    gap: Spacing.half,
  },
  stripLine: {
    color: WHITE,
  },
  microLabel: {
    color: WHITE_DIM,
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  contrail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: WHITE_DIM,
    opacity: 0.55,
  },
  rotated: {
    transform: [{ rotate: '90deg' }],
  },
  statsRow: {
    flexDirection: 'row',
  },
  statsStack: {
    gap: Spacing.one,
  },
  statStacked: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  statLabelStacked: {
    flex: 1,
  },
  stat: {
    flex: 1,
    gap: Spacing.one,
  },
  statLabel: {
    color: WHITE_DIM,
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statValue: {
    color: WHITE,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  aloft: {
    color: COBALT,
    marginTop: -Spacing.two,
  },
  cta: {
    color: WHITE_DIM,
    textAlign: 'center',
  },
  ctaLink: {
    color: WHITE,
    fontWeight: 700,
    textDecorationLine: 'underline',
  },
});
