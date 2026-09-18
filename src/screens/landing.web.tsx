import { Image } from 'expo-image';
import { Link, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { SymbolView } from 'expo-symbols';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { PrimaryButton } from '@/components/primary-button';
import { SiteChrome, StoreBadges } from '@/components/site-chrome';
import { ThemedText } from '@/components/themed-text';
import { STORE_URLS } from '@/constants/store-links';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayLabel, localDateString } from '@/services/dates';
import { normalizeFlightNumber } from '@/services/flight-lookup';
import { proPriceFrom } from '@/services/web-pricing';

/** getflyright.com's front page. The app as it is — a travel buddy for the
 * day you fly, with the EU261 claim as the moment it pays for itself — told
 * with real captures of the current build. Sections are full-bleed; each
 * centres its content at WIDE. Below COMPACT everything stacks. */

const WIDE = 1120;
const COMPACT = 900;

/** The brand's night sky: the claims band keeps it in both themes, the way
 * the share poster does. */
const NIGHT = { bg: '#0C1B36', surface: '#16264A', text: '#F2F6FB', muted: '#8FA2BB', green: '#2FD68C', field: '#0B1730' };

const SHOTS = {
  journeys: require('@/assets/images/landing/journeys.png'),
  travelDay: require('@/assets/images/landing/travel-day.png'),
  world: require('@/assets/images/landing/world.png'),
  stats: require('@/assets/images/landing/stats.png'),
  addFlight: require('@/assets/images/landing/add-flight.png'),
  verdict: require('@/assets/images/landing/verdict.png'),
  people: require('@/assets/images/landing/people.png'),
};

type Symbol = ComponentProps<typeof SymbolView>['name'];

const FEATURES: { symbol: Symbol; title: string; body: string }[] = [
  {
    symbol: { ios: 'airplane.departure', android: 'flight_takeoff', web: 'flight_takeoff' },
    title: 'Travel day, live',
    body: 'Gate, delay and boarding on your lock screen — every step from the airport to the seat, ticked off as you go.',
  },
  {
    symbol: { ios: 'person.2.fill', android: 'group', web: 'group' },
    title: 'People who fly with you',
    body: 'Your circle follows the trip live: the delay, the landing, the photo from the gate. No more “landed?” texts.',
  },
  {
    symbol: { ios: 'book.closed.fill', android: 'menu_book', web: 'menu_book' },
    title: 'A journal that fills itself',
    body: 'Every flight remembered with its seat, its notes and its photos. Scan a boarding pass, or just type the number.',
  },
  {
    symbol: { ios: 'globe.europe.africa.fill', android: 'public', web: 'public' },
    title: 'Your world, on a globe',
    body: 'Every route you have flown, on the earth itself — and a poster of it to share.',
  },
  {
    symbol: { ios: 'eurosign.circle.fill', android: 'euro', web: 'euro' },
    title: 'Know what you’re owed',
    body: 'A delay of three hours can be worth €600. FlyRight tells you the moment a flight starts owing you money.',
  },
  {
    symbol: { ios: 'doc.text.fill', android: 'description', web: 'description' },
    title: 'Claim, don’t decode',
    body: 'Pro writes the airline-ready letter and tracks the six-week deadline. You keep every euro — no commission.',
  },
];

export function Landing() {
  const { width } = useWindowDimensions();
  const compact = width < COMPACT;
  return (
    <SiteChrome bare>
      <Head>
        <title>FlyRight — your travel day, live</title>
        <meta
          name="description"
          content="Gates, delays and boarding as they happen, shared with the people waiting for you. A journal that fills itself, your routes on a globe — and what airlines owe you when a flight goes wrong."
        />
        <link rel="canonical" href="https://getflyright.com/" />
      </Head>
      <Hero compact={compact} />
      <Features compact={compact} />
      <ClaimsBand compact={compact} />
      <Screens compact={compact} />
      <Pro compact={compact} />
    </SiteChrome>
  );
}

function Section({ children, style, background }: { children: ReactNode; style?: object; background?: string }) {
  return (
    <View style={[styles.section, background ? { backgroundColor: background } : null, style]}>
      <View style={styles.wrap}>{children}</View>
    </View>
  );
}

function Hero({ compact }: { compact: boolean }) {
  const theme = useTheme();
  return (
    <Section style={{ paddingTop: compact ? Spacing.five : 72, paddingBottom: compact ? Spacing.four : 40 }}>
      <View style={[styles.two, compact && styles.stack]}>
        <View style={[styles.copy, compact && styles.stackChild]}>
          <ThemedText type="smallBold" themeColor="tint" style={styles.eyebrow}>
            FLIGHT TRACKER · TRAVEL JOURNAL · EU261 CLAIMS
          </ThemedText>
          <ThemedText
            role="heading"
            aria-level={1}
            themeColor="heading"
            style={[styles.h1, compact && styles.h1Compact]}>
            Your travel day, <ThemedText style={[styles.h1, compact && styles.h1Compact, { color: theme.tint }]}>live.</ThemedText>
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.lede}>
            Gates, delays and boarding, as they happen. Shared with the people waiting for you.
            And what you’re owed when the flight goes wrong.
          </ThemedText>
          <View style={styles.ctas}>
            <StoreBadges />
            <Link href="/check">
              <ThemedText type="linkPrimary">Check a flight →</ThemedText>
            </Link>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Free to start · no account needed · EU &amp; UK rules
          </ThemedText>
        </View>
        <View style={[styles.art, compact && styles.artCompact, compact && styles.stackChild]}>
          <Phone source={SHOTS.travelDay} width={compact ? 200 : 270} style={[styles.phoneBack, compact && styles.phoneBackCompact]} />
          <Phone source={SHOTS.world} width={compact ? 200 : 270} style={[styles.phoneFront, compact && styles.phoneFrontCompact]} />
        </View>
      </View>
    </Section>
  );
}

function Features({ compact }: { compact: boolean }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  return (
    <Section>
      <ThemedText role="heading" aria-level={2} themeColor="heading" style={styles.h2}>
        The whole day, not just the delay
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.sub}>
        Flight trackers tell you your flight is late. FlyRight is with you from the taxi to the
        gate to the moment you land — and it remembers.
      </ThemedText>
      <View style={styles.grid}>
        {FEATURES.map((feature) => (
          <View
            key={feature.title}
            style={[
              styles.card,
              { backgroundColor: theme.backgroundElement, borderColor: theme.hairline },
              { width: compact ? '100%' : '31.5%' },
            ]}>
            <View style={[styles.iconTile, { backgroundColor: scheme === 'dark' ? theme.backgroundSelected : '#E8F0FC' }]}>
              <SymbolView name={feature.symbol} size={22} weight="semibold" tintColor={theme.tint} />
            </View>
            <ThemedText type="smallBold" themeColor="heading" style={styles.cardTitle}>
              {feature.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {feature.body}
            </ThemedText>
          </View>
        ))}
      </View>
    </Section>
  );
}

/** The claim, where it belongs on this page: after the day, as the moment the
 * app pays for itself. The form hands off to /check, which does the lookup. */
function ClaimsBand({ compact }: { compact: boolean }) {
  const router = useRouter();
  const [today] = useState(() => new Date());
  const [flightInput, setFlightInput] = useState('');
  const [date, setDate] = useState(localDateString(today));
  const flight = normalizeFlightNumber(flightInput);
  const quick = [
    { label: 'Today', day: localDateString(today) },
    { label: 'Yesterday', day: localDateString(today, -1) },
  ];
  return (
    <Section background={NIGHT.bg} style={{ paddingVertical: compact ? Spacing.five : 64 }}>
      <View style={[styles.two, compact && styles.stack]}>
        <View style={[styles.copy, compact && styles.stackChild]}>
          <ThemedText type="smallBold" style={[styles.eyebrow, { color: NIGHT.green }]}>
            WHEN THE FLIGHT GOES WRONG
          </ThemedText>
          <ThemedText role="heading" aria-level={2} style={[styles.h2, { color: NIGHT.text }]}>
            Delayed or cancelled? Check what you’re owed.
          </ThemedText>
          <ThemedText style={[styles.sub, { color: NIGHT.muted }]}>
            Airlines owe up to €600 per passenger under EU261 — and most people never claim it.
            Ten seconds, no sign-up.
          </ThemedText>
          <View style={[styles.strip, compact && styles.stack]}>
            {[
              ['€250–600', 'per passenger, by distance'],
              ['3 h+', 'delay at arrival, or a cancellation'],
              ['0 %', 'commission — the airline pays you'],
            ].map(([big, small]) => (
              <View key={big} style={[styles.stat, { backgroundColor: NIGHT.surface }]}>
                <ThemedText style={[styles.statBig, { color: NIGHT.green }]}>{big}</ThemedText>
                <ThemedText type="small" style={{ color: NIGHT.muted }}>
                  {small}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
        <View style={[styles.checker, compact && styles.stackChild, { backgroundColor: NIGHT.surface }]}>
          <ThemedText type="smallBold" style={{ color: NIGHT.text }}>
            Your flight
          </ThemedText>
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            value={flightInput}
            onChangeText={setFlightInput}
            onSubmitEditing={() => flight && router.push({ pathname: '/check', params: { flight, date } })}
            placeholder="AY1331 or LH873"
            placeholderTextColor={NIGHT.muted}
            accessibilityLabel="Flight number"
            style={[styles.input, { color: NIGHT.text, backgroundColor: NIGHT.field }]}
          />
          <ThemedText type="smallBold" style={{ color: NIGHT.text }}>
            Departure date
          </ThemedText>
          <View style={styles.chips}>
            {quick.map(({ label, day }) => (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityState={{ selected: date === day }}
                onPress={() => setDate(day)}
                style={[styles.chip, { backgroundColor: date === day ? '#4E9BF5' : NIGHT.field }]}>
                <ThemedText type="smallBold" style={{ color: date === day ? '#FFFFFF' : NIGHT.text }}>
                  {label} · {formatDayLabel(day)}
                </ThemedText>
              </Pressable>
            ))}
            <Link href="/check" asChild>
              <Pressable accessibilityRole="button" style={StyleSheet.flatten([styles.chip, { backgroundColor: NIGHT.field }])}>
                <ThemedText type="smallBold" style={{ color: NIGHT.text }}>
                  Another date
                </ThemedText>
              </Pressable>
            </Link>
          </View>
          <PrimaryButton
            label="Check my compensation →"
            disabled={!flight}
            onPress={() => router.push({ pathname: '/check', params: { flight, date } })}
          />
          <Link href={{ pathname: '/check', params: { demo: '1' } }}>
            <ThemedText type="small" style={{ color: NIGHT.muted, textAlign: 'center' }}>
              No flight handy? See an example verdict →
            </ThemedText>
          </Link>
        </View>
      </View>
    </Section>
  );
}

function Screens({ compact }: { compact: boolean }) {
  const theme = useTheme();
  const shots: [keyof typeof SHOTS, string][] = [
    ['journeys', 'Every flight, remembered'],
    ['travelDay', 'Your travel day, live'],
    ['stats', 'Your travels, in numbers'],
    ['addFlight', 'Add flights in seconds'],
  ];
  return (
    <Section>
      <ThemedText role="heading" aria-level={2} themeColor="heading" style={styles.h2}>
        Made to be looked at
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.sub}>
        Every screen earns its place on the day you fly.
      </ThemedText>
      <View style={styles.shots}>
        {shots.map(([key, caption]) => (
          <View
            key={key}
            style={[
              styles.shot,
              { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, width: compact ? '47%' : '23.5%' },
            ]}>
            <Image source={SHOTS[key]} style={styles.shotImage} contentFit="cover" contentPosition="top" alt={caption} />
            <ThemedText type="smallBold" themeColor="heading" style={styles.shotCaption}>
              {caption}
            </ThemedText>
          </View>
        ))}
      </View>
    </Section>
  );
}

function Pro({ compact }: { compact: boolean }) {
  const theme = useTheme();
  const price = proPriceFrom(typeof navigator === 'undefined' ? undefined : navigator.language);
  return (
    <Section style={{ paddingBottom: 72 }}>
      <View
        style={[
          styles.proBox,
          compact && styles.stack,
          { backgroundColor: theme.backgroundElement, borderColor: theme.hairline },
        ]}>
        <View style={{ flex: 1.2, gap: Spacing.two }}>
          <ThemedText type="smallBold" themeColor="tint" style={styles.eyebrow}>
            FLYRIGHT PRO
          </ThemedText>
          <ThemedText role="heading" aria-level={2} themeColor="heading" style={styles.h2}>
            One delayed flight pays for years of Pro.
          </ThemedText>
          <View style={{ gap: 6, marginTop: Spacing.two }}>
            {[
              'Airline-ready claim letters, written for you',
              'Six-week response deadline tracked automatically',
              'Delay alerts the moment a flight starts owing you money',
              'A bigger circle, and inbound-aircraft predictions',
            ].map((line) => (
              <ThemedText key={line} type="small">
                <ThemedText type="smallBold" style={{ color: theme.success }}>
                  ✓{'  '}
                </ThemedText>
                {line}
              </ThemedText>
            ))}
          </View>
        </View>
        <View style={{ flex: 0.8, gap: Spacing.two }}>
          <ThemedText themeColor="heading" style={styles.price}>
            {price}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            14-day free trial · annual and lifetime at checkout · cancel anytime
          </ThemedText>
          <Link href="/go-pro" asChild>
            <Pressable accessibilityRole="button" style={StyleSheet.flatten([styles.button, { backgroundColor: theme.tint }])}>
              <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
                Start free trial
              </ThemedText>
            </Pressable>
          </Link>
          <ThemedText type="small" themeColor="textSecondary">
            Or start free in the app:{' '}
            <ExternalLink href={STORE_URLS.ios}>
              <ThemedText type="link">App Store</ThemedText>
            </ExternalLink>
            {' · '}
            <ExternalLink href={STORE_URLS.android}>
              <ThemedText type="link">Google Play</ThemedText>
            </ExternalLink>
          </ThemedText>
        </View>
      </View>
    </Section>
  );
}

/** A phone bezel around a capture. Width in points; the bezel keeps the
 * capture's 1206 × 2622 shape. */
function Phone({ source, width, style }: { source: number; width: number; style?: object }) {
  return (
    <View style={[styles.phone, { width, height: (width * 2622) / 1206, borderRadius: width * 0.16 }, style]}>
      <Image source={source} style={[styles.phoneScreen, { borderRadius: width * 0.13 }]} contentFit="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
    paddingVertical: 56,
    paddingHorizontal: Spacing.four,
  },
  wrap: {
    width: '100%',
    maxWidth: WIDE,
    alignSelf: 'center',
  },
  two: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 40,
  },
  stack: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: Spacing.four,
  },
  // In a column, a zero flex basis has nothing to grow into — the block
  // collapses and its neighbour lands on top of it (react-native-web turns
  // `flex: 0` into `0 1 0%`, so the shorthand does not save it). Stacked
  // children size to their content instead.
  stackChild: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    maxWidth: '100%',
  },
  copy: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    maxWidth: 560,
    gap: Spacing.three,
  },
  eyebrow: {
    letterSpacing: 2,
    fontSize: 12,
  },
  h1: {
    fontSize: 60,
    lineHeight: 62,
    fontWeight: 800,
    letterSpacing: -1.8,
  },
  h1Compact: {
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.2,
  },
  lede: {
    fontSize: 19,
    lineHeight: 29,
  },
  ctas: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  art: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    height: 600,
    position: 'relative',
  },
  artCompact: {
    height: 470,
    width: '100%',
  },
  phoneBack: {
    position: 'absolute',
    left: 0,
    top: 60,
    transform: [{ rotate: '-6deg' }],
  },
  phoneBackCompact: {
    left: '6%',
    top: 40,
  },
  phoneFront: {
    position: 'absolute',
    right: 0,
    top: 0,
  },
  phoneFrontCompact: {
    right: '6%',
  },
  phone: {
    backgroundColor: '#0F1420',
    padding: 9,
    shadowColor: '#0B1424',
    shadowOpacity: 0.35,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 30 },
  },
  phoneScreen: {
    width: '100%',
    height: '100%',
  },
  h2: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: 800,
    letterSpacing: -1,
  },
  sub: {
    fontSize: 17,
    lineHeight: 26,
    maxWidth: 640,
    marginTop: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    marginTop: Spacing.five,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
    gap: 6,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  strip: {
    flexDirection: 'row',
    gap: 14,
    marginTop: Spacing.three,
  },
  stat: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    gap: 2,
  },
  statBig: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 800,
  },
  checker: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    maxWidth: 520,
    width: '100%',
    borderRadius: 22,
    padding: 20,
    gap: Spacing.two,
  },
  input: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  chip: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  shots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    marginTop: Spacing.five,
  },
  shot: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  shotImage: {
    width: '100%',
    aspectRatio: 1206 / 2200,
  },
  shotCaption: {
    padding: 14,
  },
  proBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    borderRadius: 28,
    borderWidth: 1,
    padding: 36,
  },
  price: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: 800,
    letterSpacing: -1,
  },
  button: {
    alignSelf: 'flex-start',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 22,
  },
});
