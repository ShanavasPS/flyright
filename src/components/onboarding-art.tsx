import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** The intro's pictures are the app's own surfaces in miniature, not icons,
 * each on the same navy stage: the brand's identity ground (the icon's navy),
 * fixed in both themes. Decorative — each page's title and body carry the
 * meaning, so screen readers skip them. */

/** Text set straight on the stage: the dark palette, whatever the theme. */
const ON_STAGE = {
  text: '#F2F6FB',
  muted: '#8FA2BB',
  tint: '#4E9BF5',
  success: '#2FD68C',
  ring: '#2E5C9E',
} as const;

/** A card on the stage: white in light mode; in dark the night ground's card
 * colour (getflyright.com's nightSurface), which still reads on navy. */
export function useStageCard() {
  const dark = useColorScheme() === 'dark';
  return dark
    ? { backgroundColor: '#16264A', borderColor: '#22365E', borderWidth: 1 }
    : { backgroundColor: '#FFFFFF', borderColor: 'transparent', borderWidth: 1 };
}

/** The navy panel every page draws its picture on, with the brand's
 * contrail arc faint behind it. `top` anchors a picture taller than the
 * stage to its top edge, so its oldest part runs off the bottom (a stack of
 * notifications peeking out) instead of crowding the top. */
export function Stage({
  height,
  top = false,
  compact = false,
  children,
}: {
  height: number;
  top?: boolean;
  /** Short screens: a tighter inset, so the picture keeps its size. */
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.stage, { height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Path
          d="M -5 92 Q 45 88 105 18"
          stroke="#A9B8CE"
          strokeOpacity={0.18}
          strokeWidth={0.9}
          strokeDasharray="0.1 3.2"
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      <View style={[styles.stageContent, compact && styles.stageCompact, top && styles.stageTop]}>{children}</View>
    </View>
  );
}

/** The welcome page: the app icon itself, floating on the stage. */
export function BrandArt() {
  return (
    <View style={styles.brand}>
      <Image style={styles.brandIcon} source={require('@/assets/images/icon.png')} />
      <ThemedText style={styles.brandName}>FlyRight</ThemedText>
    </View>
  );
}

// Stock portraits (Unsplash licence) — the same faces as the store
// screenshots' demo people; letter avatars never appear in a demo.
const RAIL = [
  { name: 'Noah Berg', first: 'Noah', photo: require('@/assets/images/onboarding/noah.jpg'), status: 'Landing', tone: ON_STAGE.tint },
  { name: 'Maja Lindqvist', first: 'Maja', photo: require('@/assets/images/onboarding/maja.jpg'), status: 'Boarding', tone: ON_STAGE.success },
  { name: 'Tomas Ek', first: 'Tomas', photo: require('@/assets/images/onboarding/tomas.jpg'), status: 'In Lisbon', tone: ON_STAGE.muted },
] as const;

/** The top of the Updates tab: who is travelling right now, then a postcard. */
export function UpdatesArt({ compact = false }: { compact?: boolean }) {
  const card = useStageCard();
  return (
    <View style={styles.stack}>
      <View style={styles.rail}>
        {RAIL.map((p) => (
          <View key={p.name} style={styles.railPerson}>
            <Avatar
              name={p.name}
              imageUrl={p.photo}
              size={compact ? 40 : 48}
              ring={p.tone === ON_STAGE.muted ? ON_STAGE.ring : p.tone}
            />
            <ThemedText type="smallBold" numberOfLines={1} style={{ color: ON_STAGE.text }}>
              {p.first}
            </ThemedText>
            <ThemedText type="small" numberOfLines={1} style={{ color: p.tone }}>
              {p.status}
            </ThemedText>
          </View>
        ))}
      </View>
      <View style={[styles.card, card]}>
        <View style={styles.cardHeader}>
          <Avatar name="Clara Nyström" imageUrl={require('@/assets/images/onboarding/clara.jpg')} size={32} />
          <View style={styles.cardWho}>
            <ThemedText type="smallBold" numberOfLines={1}>
              Clara Nyström{' '}
              <ThemedText type="small" themeColor="textSecondary">2 min ago</ThemedText>
            </ThemedText>
            {!compact && (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                AY1571 HEL → CDG · Through security
              </ThemedText>
            )}
          </View>
        </View>
        <ThemedText type="small" numberOfLines={compact ? 1 : 2}>
          Through security with time for a coffee. Paris by lunch.
        </ThemedText>
      </View>
    </View>
  );
}

/** A delay verdict as the trip page shows it — money is the one place the
 * success colour belongs. */
export function ClaimArt() {
  const theme = useTheme();
  const card = useStageCard();
  return (
    <View style={styles.stack}>
      <View style={[styles.card, card]}>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          AY1331 HEL → LHR · Landed 3 h 12 min late
        </ThemedText>
        <ThemedText style={[styles.owed, { color: theme.success }]}>You&apos;re owed €400</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Over 3 hours late on this route is worth €400 under EU261.
        </ThemedText>
        <View style={[styles.claimRow, { borderTopColor: theme.hairline }]}>
          <ThemedText type="smallBold" themeColor="tint">Prepare the claim</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Pro</ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    borderRadius: Spacing.five,
    overflow: 'hidden',
    experimental_backgroundImage: 'linear-gradient(200deg, #16345F, #0B1D3E)',
    backgroundColor: '#0C1B36',
  },
  stageContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
  },
  stageCompact: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  stageTop: {
    justifyContent: 'flex-start',
  },
  brand: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  brandIcon: {
    width: 112,
    height: 112,
    // The iOS icon mask's corner, about 22.4% of the side.
    borderRadius: 25,
    // toastShadow: the one heavy shadow, for something floating over a surface.
    shadowColor: '#070F20',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  brandName: {
    color: ON_STAGE.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  stack: {
    alignSelf: 'stretch',
    gap: Spacing.three,
  },
  rail: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  railPerson: {
    alignItems: 'center',
    gap: Spacing.half,
    width: 72,
  },
  card: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardWho: {
    flex: 1,
  },
  owed: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
  },
  claimRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
});
