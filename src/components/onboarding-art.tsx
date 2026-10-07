import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Avatar } from '@/components/avatar';
import { OnboardingWorld } from '@/components/onboarding-world';
import { WorldShareCard } from '@/components/world-share-card';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { RouteSource } from '@/services/geo';
import { SHARE_CARD, shareMapModel, type ShareCopy } from '@/services/world-share';

/**
 * The intro's pictures: the app's own surfaces in miniature, each on the
 * intro's navy ground (the icon's night-flight navy, fixed in both themes —
 * identity, not surface). They are decorative: every page's eyebrow, title
 * and body carry the meaning, so screen readers skip them.
 */

/** Text set straight on the navy: the dark palette, whatever the theme. */
export const ON_STAGE = {
  text: '#F2F6FB',
  muted: '#8FA2BB',
  tint: '#4E9BF5',
  success: '#2FD68C',
  ring: '#2E5C9E',
  /** A card on the navy (the dark scheme's backgroundElement + hairline). */
  card: '#101D34',
  hairline: '#1B2C4A',
} as const;

/** Ink on a white card drawn on the navy: the light scheme's text colours,
 * fixed like the card itself. */
const ON_CARD = {
  text: '#0B1424',
  heading: '#13294B',
  muted: '#5A6A7E',
  field: '#F2F5F9',
  selected: '#E8EEF6',
  tint: '#1E6BE0',
  success: '#0FA362',
} as const;

/** A card on the stage: white in light mode; in dark the night ground's card
 * colour (getflyright.com's nightSurface), which still reads on navy. The
 * notification reminder sheet (components/notification-pitch) draws on it. */
export function useStageCard() {
  const dark = useColorScheme() === 'dark';
  return dark
    ? { backgroundColor: '#16264A', borderColor: '#22365E', borderWidth: 1 }
    : { backgroundColor: '#FFFFFF', borderColor: 'transparent', borderWidth: 1 };
}

/** The brand's contrail arc, faint behind a page's picture. */
export function Contrail({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <Svg style={[StyleSheet.absoluteFill, style]} viewBox="0 0 100 100" preserveAspectRatio="none" pointerEvents="none">
      <Path
        d="M -5 70 Q 50 35 105 70"
        stroke="#A9B8CE"
        strokeOpacity={0.14}
        strokeWidth={0.6}
        strokeDasharray="0.1 2.6"
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

const hidden = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** The welcome page: the app icon itself, floating on the navy, and the
 * name under it. */
export function BrandArt({ compact = false }: { compact?: boolean }) {
  const side = compact ? 104 : 136;
  return (
    <View style={styles.brand} {...hidden}>
      <View style={styles.brandGlow} />
      <Image
        style={[styles.brandIcon, { width: side, height: side, borderRadius: Math.round(side * 0.224) }]}
        source={require('@/assets/images/icon.png')}
      />
    </View>
  );
}

/** A quiet line under a picture, its surface named first: "Lock Screen ·
 * from four hours before departure…". */
function Caption({ lead, text }: { lead: string; text: string }) {
  return (
    <Text style={styles.caption}>
      <Text style={styles.captionLead}>{lead}</Text> · {text}
    </Text>
  );
}

function Plane({ size, color }: { size: number; color: string }) {
  return (
    <SymbolView
      name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
      size={size}
      tintColor={color}
      style={{ width: size, height: size }}
    />
  );
}

/** The travel-day page: the Live Activity as the Lock Screen shows it, and
 * the Home Screen widget beside its caption. */
export function TravelDayArt({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.stack} {...hidden}>
      <View style={[styles.navyCard, styles.live]}>
        <View style={styles.liveTop}>
          <View>
            <View style={styles.liveLabelRow}>
              <Plane size={12} color={ON_STAGE.tint} />
              <Text style={[styles.tracked, { color: ON_STAGE.tint }]}>DEPARTS IN</Text>
            </View>
            <View style={styles.liveClock}>
              <Text style={[styles.liveBig, compact && styles.liveBigCompact]}>3:58</Text>
              <Text style={styles.liveSeconds}>:41</Text>
            </View>
            <View style={styles.liveUnits}>
              <Text style={styles.liveUnit}>HRS</Text>
              <Text style={styles.liveUnit}>MIN</Text>
            </View>
          </View>
          <View style={styles.liveRight}>
            <Text style={styles.liveUnit}>TERMINAL</Text>
            <Text style={styles.liveTerminal}>2</Text>
          </View>
        </View>
        <View style={styles.liveRoute}>
          <View>
            <Text style={styles.liveCode}>HEL</Text>
            <Text style={styles.liveTime}>11:10</Text>
          </View>
          <View style={styles.liveTrack}>
            <Text style={[styles.liveTrackLabel, { top: -8 }]}>Finnair</Text>
            <View style={styles.liveLine} />
            <View style={styles.liveFlown} />
            <View style={styles.livePlane}>
              <Plane size={14} color={ON_STAGE.text} />
            </View>
            <Text style={[styles.liveTrackLabel, { bottom: -8 }]}>12h 55m</Text>
          </View>
          <View style={styles.alignEnd}>
            <Text style={styles.liveCode}>HND</Text>
            <Text style={styles.liveTime}>06:05</Text>
          </View>
        </View>
      </View>
      <Caption lead="Lock Screen" text="from four hours before departure until the bags are out." />

      <View style={[styles.widgetRow, compact && styles.widgetRowCompact]}>
        <View style={[styles.navyCard, styles.widget, compact && styles.widgetCompact]}>
          <View style={styles.widgetTop}>
            <Text style={styles.tracked}>NEXT FLIGHT</Text>
            <Plane size={14} color={ON_STAGE.tint} />
          </View>
          <View>
            <Text style={styles.widgetWait}>In 2 weeks</Text>
            <Text style={styles.widgetRoute}>HEL · HND</Text>
          </View>
          <View style={styles.widgetTimes}>
            <Text style={styles.widgetTime}>11:10</Text>
            <Text style={styles.widgetTime}>06:05</Text>
          </View>
        </View>
        <View style={styles.widgetCaption}>
          <Text style={styles.captionLead}>Home Screen</Text>
          <Text style={styles.caption}>The next flight, always in view.</Text>
        </View>
      </View>
    </View>
  );
}

// Stock portraits (Unsplash licence) — the same faces as the store
// screenshots' demo people; letter avatars never appear in a demo.
const RAIL = [
  { name: 'Noah Berg', first: 'Noah', photo: require('@/assets/images/onboarding/noah.jpg'), status: '6h 21m', tone: ON_CARD.tint },
  { name: 'Clara Nyström', first: 'Clara', photo: require('@/assets/images/onboarding/clara.jpg'), status: '1h 9m', tone: ON_CARD.tint },
  { name: 'Tomas Ek', first: 'Tomas', photo: require('@/assets/images/onboarding/tomas.jpg'), status: 'Landed', tone: ON_CARD.success },
  { name: 'Maja Lindqvist', first: 'Maja', photo: require('@/assets/images/onboarding/maja.jpg'), status: 'Boarding', tone: ON_CARD.muted },
] as const;

/** The Updates page: the rail of friends flying today, then a postcard with
 * its photo and the hearts and replies it got. */
export function UpdatesArt({ compact = false }: { compact?: boolean }) {
  const avatar = compact ? 40 : 48;
  return (
    <View style={styles.stack} {...hidden}>
      <View style={[styles.whiteCard, styles.rail]}>
        {RAIL.map((p) => (
          <View key={p.name} style={styles.railPerson}>
            <Avatar name={p.name} imageUrl={p.photo} size={avatar} ring={p.tone === ON_CARD.muted ? '#C9D3E0' : p.tone} />
            <Text style={styles.railName} numberOfLines={1}>
              {p.first}
            </Text>
            <Text style={[styles.railStatus, { color: p.tone }]} numberOfLines={1}>
              {p.status}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.whiteCard, styles.postcard, compact && styles.postcardCompact]}>
        <View style={styles.postcardHeader}>
          <Avatar name="Noah Berg" imageUrl={require('@/assets/images/onboarding/noah.jpg')} size={32} />
          <View style={styles.postcardWho}>
            <Text style={styles.postcardName} numberOfLines={1}>
              Noah Berg <Text style={styles.postcardWhen}>53m ago</Text>
            </Text>
            <Text style={styles.postcardLeg} numberOfLines={1}>
              AY5 HEL → JFK · In the air
            </Text>
          </View>
        </View>
        <Image
          style={[styles.postcardPhoto, compact && styles.postcardPhotoCompact]}
          source={require('@/assets/images/onboarding/wing.jpg')}
          contentFit="cover"
        />
        <View style={styles.postcardActions}>
          <View style={[styles.pill, { backgroundColor: ON_CARD.selected }]}>
            <SymbolView
              name={{ ios: 'heart.fill', android: 'favorite', web: 'favorite' }}
              size={14}
              tintColor={ON_CARD.tint}
              style={styles.pillIcon}
            />
            <Text style={[styles.pillCount, { color: ON_CARD.tint }]}>4</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: ON_CARD.field }]}>
            <SymbolView
              name={{ ios: 'bubble.left', android: 'chat_bubble_outline', web: 'chat_bubble_outline' }}
              size={14}
              tintColor={ON_CARD.muted}
              style={styles.pillIcon}
            />
            <Text style={[styles.pillCount, { color: ON_CARD.muted }]}>2</Text>
          </View>
          <Text style={styles.postcardNames} numberOfLines={1}>
            Clara and 3 others
          </Text>
        </View>
      </View>
    </View>
  );
}

/** A traveller's year, as the pictures draw it: flown routes out of
 * Helsinki, one still to fly so a plane waits on it. The codes are real
 * airports; the dates are relative so the picture never goes stale. */
function sampleRows(now: Date): RouteSource[] {
  const day = 24 * 3_600_000;
  const at = (daysFromNow: number) => new Date(now.getTime() + daysFromNow * day).toISOString();
  const leg = (id: string, from: string, to: string, number: string, carrier: string, daysFromNow: number): RouteSource => ({
    id,
    fromCode: from,
    toCode: to,
    number,
    carrier,
    scheduledDeparture: at(daysFromNow),
  });
  return [
    leg('intro-1', 'HEL', 'JFK', 'AY5', 'Finnair', -300),
    leg('intro-2', 'JFK', 'HEL', 'AY6', 'Finnair', -290),
    leg('intro-3', 'HEL', 'NRT', 'AY61', 'Finnair', -220),
    leg('intro-4', 'NRT', 'HEL', 'AY62', 'Finnair', -210),
    leg('intro-5', 'HEL', 'SIN', 'AY131', 'Finnair', -150),
    leg('intro-6', 'SIN', 'HEL', 'AY132', 'Finnair', -140),
    leg('intro-7', 'HEL', 'LHR', 'AY1331', 'Finnair', -90),
    leg('intro-8', 'LHR', 'LAX', 'BA283', 'British Airways', -88),
    leg('intro-9', 'LAX', 'HEL', 'AY2', 'Finnair', -80),
    leg('intro-10', 'HEL', 'DXB', 'AY1', 'Finnair', -40),
    leg('intro-11', 'DXB', 'HEL', 'AY8', 'Finnair', -33),
    leg('intro-12', 'HEL', 'HND', 'AY73', 'Finnair', 14),
  ];
}

/** The World page: the globe itself, lit by the real sun with the sun in
 * the sky, over the sample year. */
export function WorldArt({ compact = false }: { compact?: boolean }) {
  const rows = useMemo(() => sampleRows(new Date()), []);
  return (
    <View style={[styles.world, { height: compact ? 260 : 340 }]} {...hidden}>
      <OnboardingWorld rows={rows} height={compact ? 260 : 340} />
    </View>
  );
}

const POSTER_COPY: ShareCopy = {
  eyebrow: "EVERYWHERE I'VE FLOWN",
  title: '2025 – 2026',
  subtitle: null,
  stats: [
    { value: '12', label: 'flights' },
    { value: '7', label: 'airports' },
    { value: '6', label: 'countries' },
    { value: '131', label: 'hours' },
  ],
  details: [
    { label: 'Most visited', value: 'Tokyo' },
    { label: 'Longest flight', value: 'HEL → SIN · 11 hrs 35 min' },
    { label: 'Most flown', value: 'Finnair' },
  ],
  single: false,
};

/** The poster page: the real share poster twice, night and day, fanned like
 * two prints on a desk. Drawn at the poster's own size and scaled down, so
 * it is exactly what the share sheet would send. */
export function PosterArt({ compact = false }: { compact?: boolean }) {
  const model = useMemo(() => shareMapModel(sampleRows(new Date()), new Date(), 'story', false), []);
  const scale = compact ? 0.46 : 0.58;
  const w = SHARE_CARD.width * scale;
  const h = SHARE_CARD.height.story * scale;
  const poster = (theme: 'dark' | 'light') => (
    <View style={{ width: w, height: h }}>
      <View
        style={{
          width: SHARE_CARD.width,
          height: SHARE_CARD.height.story,
          transform: [{ translateX: (w - SHARE_CARD.width) / 2 }, { translateY: (h - SHARE_CARD.height.story) / 2 }, { scale }],
        }}>
        <WorldShareCard model={model} copy={POSTER_COPY} format="story" theme={theme} heatUri={null} />
      </View>
    </View>
  );
  return (
    <View style={[styles.posters, { height: h + 24 }]} {...hidden}>
      <View style={[styles.poster, { right: Spacing.four, top: 12, transform: [{ rotate: '8deg' }], opacity: 0.94 }]}>
        {poster('light')}
      </View>
      <View style={[styles.poster, styles.posterFront, { left: Spacing.four, top: 0, transform: [{ rotate: '-6deg' }] }]}>
        {poster('dark')}
      </View>
    </View>
  );
}

const HEADS_UP = [
  {
    title: 'Clara is flying tomorrow',
    body: 'AY1571 · HEL → CDG · Departs 07:35.',
    when: 'now',
  },
  {
    title: 'Noah is in the air to New York',
    body: 'AY5 · HEL → JFK · Lands 15:40. Bags at belt 7.',
    when: '9:41',
  },
  {
    title: 'Tomas landed in Lisbon',
    body: 'AY1773 · HEL → LIS · Bags at belt 4.',
    when: '8:06',
  },
] as const;

/** The heads-up page: three of the pushes a friend's trip sends, as they
 * land on the Lock Screen — a flight tomorrow, one in the air, one down. */
export function HeadsUpArt() {
  return (
    <View style={styles.stack} {...hidden}>
      {HEADS_UP.map((n) => (
        <View key={n.title} style={styles.banner}>
          <Image style={styles.bannerIcon} source={require('@/assets/images/icon.png')} />
          <View style={styles.bannerBody}>
            <View style={styles.bannerTop}>
              <Text style={styles.bannerTitle} numberOfLines={2}>
                {n.title}
              </Text>
              <Text style={styles.bannerWhen}>{n.when}</Text>
            </View>
            <Text style={styles.bannerText}>{n.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  brand: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    experimental_backgroundImage: 'radial-gradient(circle, rgba(78,155,245,0.32) 0%, rgba(78,155,245,0) 68%)',
  },
  brandIcon: {
    // toastShadow: the one heavy shadow, for something floating over a surface.
    shadowColor: '#070F20',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
  },
  caption: {
    color: ON_STAGE.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  captionLead: {
    color: ON_STAGE.text,
    fontWeight: 700,
    fontSize: 14,
    lineHeight: 20,
  },
  tracked: {
    color: ON_STAGE.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 700,
    letterSpacing: 1.2,
  },
  navyCard: {
    backgroundColor: ON_STAGE.card,
    borderColor: ON_STAGE.hairline,
    borderWidth: 1,
  },
  // The Live Activity, as the Lock Screen draws it.
  live: {
    alignSelf: 'stretch',
    borderRadius: Spacing.four,
    paddingHorizontal: 20,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three - Spacing.half,
    marginTop: Spacing.three,
  },
  liveTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  liveLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
  },
  liveClock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    marginTop: Spacing.half,
  },
  liveBig: {
    color: ON_STAGE.text,
    fontSize: 44,
    lineHeight: 48,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  liveBigCompact: {
    fontSize: 36,
    lineHeight: 40,
  },
  liveSeconds: {
    color: ON_STAGE.muted,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
  liveUnits: {
    flexDirection: 'row',
    gap: 30,
  },
  liveUnit: {
    color: ON_STAGE.muted,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: 700,
    letterSpacing: 1,
  },
  liveRight: {
    alignItems: 'flex-end',
  },
  liveTerminal: {
    color: ON_STAGE.text,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: 700,
  },
  liveRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  liveCode: {
    color: ON_STAGE.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: 700,
  },
  liveTime: {
    color: ON_STAGE.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 500,
  },
  alignEnd: {
    alignItems: 'flex-end',
  },
  liveTrack: {
    flex: 1,
    height: 22,
    justifyContent: 'center',
  },
  liveLine: {
    height: 2,
    borderRadius: 1,
    backgroundColor: ON_STAGE.hairline,
  },
  liveFlown: {
    position: 'absolute',
    left: 0,
    width: '8%',
    height: 2,
    backgroundColor: ON_STAGE.tint,
  },
  livePlane: {
    position: 'absolute',
    left: '6%',
    top: 4,
  },
  liveTrackLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: ON_STAGE.muted,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: 600,
  },
  widgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  widgetRowCompact: {
    marginTop: Spacing.two,
  },
  // The small Home Screen widget: times, no arrow (see src/widgets/next-flight.tsx).
  widget: {
    width: 150,
    height: 150,
    borderRadius: Spacing.five,
    padding: Spacing.three,
    justifyContent: 'space-between',
  },
  widgetCompact: {
    width: 124,
    height: 124,
    padding: Spacing.three - Spacing.one,
  },
  widgetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  widgetWait: {
    color: ON_STAGE.text,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: 700,
  },
  widgetRoute: {
    color: ON_STAGE.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  widgetTimes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  widgetTime: {
    color: ON_STAGE.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  widgetCaption: {
    flex: 1,
    gap: Spacing.two,
  },
  whiteCard: {
    backgroundColor: '#FFFFFF',
    alignSelf: 'stretch',
  },
  rail: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    borderRadius: Spacing.three + Spacing.half,
    paddingVertical: Spacing.two,
    marginHorizontal: Spacing.three,
  },
  railPerson: {
    alignItems: 'center',
    gap: Spacing.half,
    width: 64,
  },
  railName: {
    color: ON_CARD.heading,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: 700,
  },
  railStatus: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 700,
  },
  postcard: {
    borderRadius: 20,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    transform: [{ rotate: '-2deg' }],
    // toastShadow: the postcard floats over the navy like a print.
    shadowColor: '#070F20',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  postcardCompact: {
    marginTop: Spacing.two,
  },
  postcardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
  },
  postcardWho: {
    flex: 1,
  },
  postcardName: {
    color: ON_CARD.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: 700,
  },
  postcardWhen: {
    color: ON_CARD.muted,
    fontWeight: 500,
  },
  postcardLeg: {
    color: ON_CARD.muted,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: 500,
  },
  postcardPhoto: {
    width: '100%',
    aspectRatio: 3 / 2,
    borderRadius: 12,
  },
  postcardPhotoCompact: {
    aspectRatio: 2,
  },
  postcardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    paddingHorizontal: Spacing.one,
    paddingTop: Spacing.two,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  pillIcon: {
    width: 14,
    height: 14,
  },
  pillCount: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: 700,
  },
  postcardNames: {
    flex: 1,
    textAlign: 'right',
    color: ON_CARD.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 500,
  },
  world: {
    alignSelf: 'stretch',
    marginHorizontal: -Spacing.three,
  },
  posters: {
    alignSelf: 'stretch',
    marginTop: Spacing.two,
  },
  poster: {
    position: 'absolute',
    borderRadius: 18,
    overflow: 'hidden',
  },
  posterFront: {
    // toastShadow: the front print lifts off the one behind it.
    shadowColor: '#070F20',
    shadowOpacity: 0.55,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 8,
  },
  // A notification banner, as the Lock Screen stacks them.
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    alignSelf: 'stretch',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(28,44,74,0.92)',
    marginTop: Spacing.three,
  },
  bannerIcon: {
    width: 38,
    height: 38,
    // The iOS icon mask's corner, about 22.4% of the side.
    borderRadius: 8.5,
  },
  bannerBody: {
    flex: 1,
    gap: Spacing.half,
  },
  bannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  bannerTitle: {
    flex: 1,
    color: ON_STAGE.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: 700,
  },
  bannerWhen: {
    color: '#B7C3D4',
    fontSize: 11,
    lineHeight: 18,
    fontWeight: 500,
  },
  bannerText: {
    color: '#B7C3D4',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: 500,
  },
});
