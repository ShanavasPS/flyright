import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { earthComparison, type TravelStats } from '@/services/timeline';

// The card keeps the brand's night-flight navy in BOTH themes — on the light
// porcelain page it reads as the one premium object on screen, in dark mode
// the gradient lifts it just above the flat card surfaces. Text colors are
// therefore fixed (white on navy), not theme tokens.
const NIGHT_SKY = 'linear-gradient(150deg, #1C3459 0%, #0C1B36 62%, #091530 100%)';
const WHITE = '#F2F6FB';
const WHITE_DIM = 'rgba(242,246,251,0.62)';
const WHITE_FAINT = 'rgba(242,246,251,0.16)';
const COBALT = '#7FB1F2';

/** The rewarding little flex at the top of My travels — a passport-style
 * navy card that opens the full Travel stats screen. Renders nothing until
 * there's at least one trip. Signed-out users get the backup pitch — the
 * trips they just logged are the reason to make an account. */
export function TravelStatsHeader({ stats }: { stats: TravelStats }) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  if (!stats.trips) return null;
  const orbit = earthComparison(stats.totalKm);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open your travel stats"
      onPress={() => router.push('/stats')}
      style={({ pressed }) => pressed && styles.pressed}>
      <View style={[styles.card, { experimental_backgroundImage: NIGHT_SKY }]}>
        <View style={styles.spacedRow}>
          <ThemedText type="smallBold" style={styles.microLabel}>
            All-time
          </ThemedText>
          <MiniContrail />
        </View>

        <View style={styles.statsRow}>
          <Stat label={stats.trips === 1 ? 'trip' : 'trips'} value={stats.trips.toLocaleString()} />
          <Stat align="center" label="km flown" value={stats.totalKm.toLocaleString()} />
          <Stat
            align="right"
            label={stats.countries === 1 ? 'country' : 'countries'}
            value={stats.countries.toLocaleString()}
          />
        </View>
        {orbit && (
          <ThemedText type="small" style={styles.orbit}>
            That&apos;s {orbit}
          </ThemedText>
        )}

        <View style={styles.divider} />
        <View style={styles.spacedRow}>
          <ThemedText type="smallBold" style={styles.footerText}>
            All travel stats
          </ThemedText>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={13}
            tintColor={WHITE_DIM}
          />
        </View>

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
    </Pressable>
  );
}

/** Left / center / right columns so the row spans the full card width. */
function Stat({
  value,
  label,
  align = 'left',
}: {
  value: string;
  label: string;
  align?: 'left' | 'center' | 'right';
}) {
  const alignItems = align === 'left' ? 'flex-start' : align === 'center' ? 'center' : 'flex-end';
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
function MiniContrail() {
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
  spacedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  orbit: {
    color: COBALT,
    marginTop: -Spacing.two,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: WHITE_FAINT,
  },
  footerText: {
    color: WHITE,
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
