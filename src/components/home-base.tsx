/** Home base surfaces (docs/home-base.md): the Travel stats card, the
 * Flights nudge and a flight's "did you move?" card. */
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

import { CityPhotoFill, PhotoCredit, photoCredit } from '@/components/city-photo';
import { CodeChips } from '@/components/stats-cards';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { flagArt } from '@/components/trip-group-mark';
import { useTheme } from '@/hooks/use-theme';
import { cityAirports, countryName } from '@/services/airports';
import type { CityPhoto } from '@/services/city-photo';
import { usePlacePhoto } from '@/components/trip-cover';
import type { CurrentHome, HomePlace, Nudge } from '@/services/home-base';

function HouseMark({ size = 44 }: { size?: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.house, { width: size, height: size, backgroundColor: theme.backgroundSelected }]}>
      <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} size={size * 0.45} tintColor={theme.heading} />
    </View>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Why this city is home, for the Home base screen. */
export function homeReason(home: CurrentHome): string {
  return home.source === 'auto'
    ? `Picked automatically: ${home.departures} of your ${plural(home.total, 'take-off')} were from ${home.city}. Wrong place? Change it.`
    : `You set ${home.city} as home. Your stats, places and trips count from here.`;
}

/** Travel stats' home base: the city's photo, where, and the airports that
 * count as home. The whole card opens the Home base screen, which carries
 * the reason and the history. */
export function HomeBaseCard({ home, onPress }: { home: CurrentHome | null; onPress: () => void }) {
  const theme = useTheme();
  const place = home ? { city: home.city, country: home.country } : null;
  const photo = usePlacePhoto(place);
  if (!home || !place) return null;
  const airports = cityAirports(home.city, home.country);
  const badge = home.source === 'auto' ? 'Auto' : 'Set by you';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Home base: ${home.city}, ${countryName(home.country)}, ${badge}. Change`}
      onPress={onPress}
      testID="home-base-change">
      <SheenCard style={styles.photoCard}>
        <View style={styles.banner}>
          <CityPhotoFill place={place} photo={photo} />
          <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: `linear-gradient(180deg, ${theme.backgroundElement}00 35%, ${theme.backgroundElement} 100%)` }]} />
          <View style={styles.pill}>
            <ThemedText type="smallBold" style={styles.pillText}>HOME BASE</ThemedText>
          </View>
          <PhotoCredit photo={photo} style={styles.cardCredit} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.headline}>
            <View style={styles.grow}>
              <ThemedText type="subtitle" themeColor="heading" numberOfLines={1} adjustsFontSizeToFit>{home.city}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {home.country ? `${countryName(home.country)} · ` : ''}{badge}
              </ThemedText>
            </View>
            <ThemedText type="link" themeColor="tint">Change</ThemedText>
          </View>
          {airports.length > 0 && <CodeChips codes={airports} strong={airports} />}
        </View>
      </SheenCard>
    </Pressable>
  );
}

/** The photo screens' header (Home base, a period, a destination): the
 * city's photo under the status bar with the name, flag and credit over it.
 * As the page scrolls it shrinks to a bar that keeps the photo, the back and
 * photo buttons and the name, and stays there while the page scrolls
 * underneath. Use with `useCollapsingHero` and an Animated.ScrollView. */
export interface CollapsingHeroState {
  y: SharedValue<number>;
  full: number;
  compact: number;
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
}

export function useCollapsingHero(height: number): CollapsingHeroState {
  const insets = useSafeAreaInsets();
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  return { y, onScroll, full: height + insets.top, compact: insets.top + 56 };
}

export function CollapsingHero({ hero, place, photo, eyebrow, title, subtitle, onChangePhoto }: {
  hero: CollapsingHeroState;
  place: HomePlace | null;
  photo: CityPhoto;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  onChangePhoto?: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const art = place ? flagArt(place.country) : null;
  const { y, full, compact } = hero;
  const travel = full - compact;
  const top = insets.top + Spacing.two;
  const hasCredit = !!photoCredit(photo);

  const frame = useAnimatedStyle(() => ({
    height: interpolate(y.value, [-200, 0, travel], [full + 200, full, compact], Extrapolation.CLAMP),
  }));
  const expanded = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, travel * 0.55], [1, 0], Extrapolation.CLAMP),
  }));
  const collapsed = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [travel * 0.6, travel], [0, 1], Extrapolation.CLAMP),
  }));
  const photoButton = useAnimatedStyle(() => ({
    transform: [{ translateY: hasCredit ? interpolate(y.value, [0, travel * 0.55], [26, 0], Extrapolation.CLAMP) : 0 }],
  }));

  return (
    <Animated.View style={[styles.collapsing, { backgroundColor: theme.backgroundSelected }, frame]}>
      {/* Full height always; the header clips it as it shrinks, so the photo
          isn't re-laid out on every frame of the scroll. */}
      <View pointerEvents="none" style={[styles.photoLayer, { height: full + 200 }]}>
        {place && <CityPhotoFill place={place} photo={photo} />}
      </View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.heroScrim]} />
      <Animated.View pointerEvents="none" style={[styles.heroText, expanded]}>
        {!!eyebrow && <ThemedText type="smallBold" style={styles.eyebrow}>{eyebrow}</ThemedText>}
        {!!title && <ThemedText type="title" style={styles.heroTitle} numberOfLines={2} accessibilityRole="header" testID="home-base-current">{title}</ThemedText>}
        {!!subtitle && (
          <View style={styles.heroSub}>
            {!!art && (
              <View style={[styles.miniFlag, styles.miniFlagLine]}>
                <SvgXml xml={art} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />
              </View>
            )}
            <ThemedText type="small" style={styles.heroSubText}>{subtitle}</ThemedText>
          </View>
        )}
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.compactTitle, { top, height: 44 }, collapsed]}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.compactTitleText}>{title}</ThemedText>
      </Animated.View>
      {hasCredit && (
        <Animated.View style={[styles.credit, { top }, expanded]}>
          <PhotoCredit photo={photo} />
        </Animated.View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        onPress={() => router.back()}
        testID="home-hero-back"
        style={[styles.back, { top }]}>
        <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={18} tintColor="#FFFFFF" />
      </Pressable>
      {onChangePhoto && (
        <Animated.View style={[styles.photoButtonSlot, { top }, photoButton]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change photo"
            hitSlop={8}
            onPress={onChangePhoto}
            testID="hero-change-photo"
            style={styles.roundButton}>
            <SymbolView name={{ ios: 'photo', android: 'image', web: 'image' }} size={17} tintColor="#FFFFFF" />
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** A one-time question on Flights when recent take-offs point elsewhere. */
export function HomeNudgeCard({ nudge, onYes, onNo }: { nudge: Nudge; onYes: () => void; onNo: () => void }) {
  const place = nudge;
  const theme = useTheme();
  return (
    <SheenCard style={[styles.card, { borderColor: theme.tint }]} testID="home-nudge">
      <View style={styles.headline}>
        <HouseMark size={36} />
        <ThemedText type="default" themeColor="heading" style={styles.grow}>Is {place.city} home now?</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {nudge.recent} of your last {nudge.of} flights took off from {place.city}
        {nudge.home ? `, and ${nudge.fromHome === 0 ? 'none' : 'just 1'} from ${nudge.home.city}` : ''}. Your trips and stats count from your home base.
      </ThemedText>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onYes} style={[styles.action, { backgroundColor: theme.tint }]} testID="home-nudge-yes">
          <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>Make {place.city} home</ThemedText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onNo} style={[styles.action, { borderColor: theme.hairline, borderWidth: 1 }]} testID="home-nudge-no">
          <ThemedText type="smallBold" themeColor="heading">Not now</ThemedText>
        </Pressable>
      </View>
    </SheenCard>
  );
}

/** On a one-way flight that looks like a move. */
export function MoveCard({ to, from, onYes, onNo }: { to: HomePlace; from: HomePlace; onYes: () => void; onNo: () => void }) {
  const theme = useTheme();
  return (
    <SheenCard style={[styles.card, { borderColor: theme.tint }]} testID="move-card">
      <View style={styles.headline}>
        <HouseMark size={36} />
        <ThemedText type="default" themeColor="heading" style={styles.grow}>One way to {to.city}</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        No return to {from.city} follows and your next flights leave from {to.city}. Was this the flight you moved on?
      </ThemedText>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onYes} style={[styles.action, { backgroundColor: theme.tint }]} testID="move-yes">
          <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>Yes, I moved</ThemedText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onNo} style={[styles.action, { borderColor: theme.hairline, borderWidth: 1 }]} testID="move-no">
          <ThemedText type="smallBold" themeColor="heading">No, it was a trip</ThemedText>
        </Pressable>
      </View>
    </SheenCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two, padding: Spacing.four, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  spaced: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  caps: { textTransform: 'uppercase', letterSpacing: 1.2 },
  headline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  grow: { flex: 1, minWidth: 0 },
  house: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: Spacing.two, marginTop: Spacing.one },
  action: { minHeight: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two },
  photoCard: { padding: 0, gap: 0, overflow: 'hidden' },
  banner: { height: 112, overflow: 'hidden' },
  pill: { position: 'absolute', left: Spacing.three, top: Spacing.three, borderRadius: 8, paddingHorizontal: Spacing.two, paddingVertical: 3, backgroundColor: 'rgba(7,15,32,0.55)' },
  pillText: { color: '#FFFFFF', fontSize: 11, lineHeight: 14, letterSpacing: 1.2 },
  cardBody: { gap: Spacing.two, paddingHorizontal: Spacing.four, paddingBottom: Spacing.four, marginTop: -Spacing.four },
  collapsing: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', zIndex: 2 },
  photoLayer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  heroScrim: { experimental_backgroundImage: 'linear-gradient(180deg, rgba(7,15,32,0.55) 0%, rgba(7,15,32,0.1) 30%, rgba(7,15,32,0.1) 45%, rgba(7,15,32,0.88) 100%)' },
  compactTitle: { position: 'absolute', left: 64, right: 64, alignItems: 'center', justifyContent: 'center' },
  compactTitleText: { color: '#FFFFFF', fontSize: 17 },
  photoButtonSlot: { position: 'absolute', right: Spacing.three },
  roundButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,15,32,0.5)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)' },
  back: { position: 'absolute', left: Spacing.three, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,15,32,0.5)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)' },
  heroText: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.three, paddingBottom: Spacing.four, gap: 2 },
  eyebrow: { color: 'rgba(214,227,244,0.9)', fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase' },
  heroTitle: { color: '#FFFFFF' },
  heroSub: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  miniFlagLine: { marginTop: 3 },
  miniFlag: { width: 21, height: 14, borderRadius: 3, overflow: 'hidden' },
  heroSubText: { color: 'rgba(214,227,244,0.95)', flexShrink: 1 },
  credit: { position: 'absolute', right: Spacing.three, maxWidth: '55%', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(7,15,32,0.45)' },
  cardCredit: { position: 'absolute', right: Spacing.three, top: Spacing.three + 2, maxWidth: '55%', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(7,15,32,0.45)' },
});
