import { Image } from 'expo-image';
import { Link, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { PrimaryButton } from '@/components/primary-button';
import { PhoneVideo } from '@/components/phone-video';
import { Float, Reveal } from '@/components/reveal';
import { SiteChrome, StoreBadges } from '@/components/site-chrome';
import { ThemedText } from '@/components/themed-text';
import { STORE_URLS } from '@/constants/store-links';
import { Spacing } from '@/constants/theme';
import { useBelowWidth, useClientLocale } from '@/hooks/use-client-value';
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

/** CSS transitions, which react-native-web renders and the type definitions
 * do not know: the theme toggle crossfades surfaces, and controls answer a
 * hover. Web-only file, so no native style validation is involved. */
const THEMED = {
  transitionProperty: 'background-color, border-color',
  transitionDuration: '260ms',
} as unknown as ViewStyle;
const INTERACTIVE = {
  transitionProperty: 'transform, background-color, opacity',
  transitionDuration: '180ms',
  transitionTimingFunction: 'ease-out',
} as unknown as ViewStyle;

/** The brand's night sky: the claims band keeps it in both themes, the way
 * the share poster does. */
const NIGHT = {
  bg: '#0C1B36',
  surface: '#16264A',
  text: '#F2F6FB',
  muted: '#8FA2BB',
  green: '#2FD68C',
  field: '#0B1730',
  hover: '#1B2F55',
};

/** The app in the page's own theme: a dark page shows the dark app. Both
 * sets are the same screens from the same seeded builds (docs/website.md). */
const SHOTS = {
  light: {
    journeys: require('@/assets/images/landing/journeys.png'),
    travelDay: require('@/assets/images/landing/travel-day.png'),
    world: require('@/assets/images/landing/world.png'),
    stats: require('@/assets/images/landing/stats.png'),
    addFlight: require('@/assets/images/landing/add-flight.png'),
    verdict: require('@/assets/images/landing/verdict.png'),
    people: require('@/assets/images/landing/people.png'),
    claims: require('@/assets/images/landing/claims.png'),
    steps: require('@/assets/images/landing/steps.png'),
    updates: require('@/assets/images/landing/updates.png'),
    share: require('@/assets/images/landing/share.png'),
  },
  dark: {
    journeys: require('@/assets/images/landing/dark/journeys.png'),
    travelDay: require('@/assets/images/landing/dark/travel-day.png'),
    world: require('@/assets/images/landing/dark/world.png'),
    stats: require('@/assets/images/landing/dark/stats.png'),
    addFlight: require('@/assets/images/landing/dark/add-flight.png'),
    verdict: require('@/assets/images/landing/dark/verdict.png'),
    people: require('@/assets/images/landing/dark/people.png'),
    claims: require('@/assets/images/landing/dark/claims.png'),
    steps: require('@/assets/images/landing/dark/steps.png'),
    updates: require('@/assets/images/landing/dark/updates.png'),
    share: require('@/assets/images/landing/dark/share.png'),
  },
};
type ShotName = keyof typeof SHOTS.light;

function useShots() {
  return SHOTS[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

/** Each claim next to the screen that makes it — the product, not an icon
 * standing in for it. Rows alternate sides; on a phone they stack. */
const FEATURES: { shot: ShotName; eyebrow: string; title: string; body: string; focus?: 'top' | 'bottom' }[] = [
  {
    shot: 'travelDay',
    eyebrow: 'TRAVEL DAY',
    title: 'Travel day, live',
    body: 'With Pro, get gate, terminal and delay updates on your lock screen, plus the plane’s reported position where available.',
  },
  {
    shot: 'steps',
    // The checklist sits under the boarding pass: show the lower half.
    focus: 'bottom',
    eyebrow: 'STEP BY STEP',
    title: 'Every step of the day, ticked off',
    body: 'With Pro, mark each step of your travel day. The people following you watch the same list move for free.',
  },
  {
    shot: 'updates',
    eyebrow: 'TRIP UPDATES',
    title: 'A photo from the window, for the people who care',
    body: 'Share a line or photo with Pro, from your flight day until a day after landing. Your people read and reply for free.',
  },
  {
    shot: 'people',
    eyebrow: 'YOUR CIRCLE',
    title: 'People who fly with you',
    body: 'Follow your people and read their postcards for free. When a traveller has Pro, their shared live updates are free for you too.',
  },
  {
    shot: 'journeys',
    eyebrow: 'JOURNAL',
    title: 'A journal that fills itself',
    body: 'Save past and upcoming flights, seats, notes and private photos for free. Scan a boarding pass, or just type the number.',
  },
  {
    shot: 'world',
    eyebrow: 'WORLD',
    title: 'Your world, on a globe',
    body: 'Every route you have flown, on the earth itself — lit by the sun where it actually is right now.',
  },
  {
    shot: 'share',
    eyebrow: 'SHARE YOUR WORLD',
    title: 'Your year in the air, as a poster',
    body: 'Story or square, dark or light, with the routes you flew glowing on the map — ready for wherever you post.',
  },
  {
    shot: 'verdict',
    // The verdict sits under the route: show the lower half of the screen.
    focus: 'bottom',
    eyebrow: 'WHEN IT GOES WRONG',
    title: 'Know what you’re owed',
    // "Up to", and from three hours, not "three hours = €600": at 3–4 hours
    // a long-haul flight pays €300, and €600 needs 4h+ on a flight leaving
    // or entering the EU (EU261 Art. 7).
    body: 'Check a past delay for free. Pro adds automatic delay alerts and help preparing a claim when compensation may apply.',
  },
  {
    shot: 'claims',
    eyebrow: 'FLYRIGHT PRO',
    title: 'Claim, don’t decode',
    body: 'Pro writes the airline-ready letter and tracks the six-week deadline. You keep every euro — no commission.',
  },
];

export function Landing() {
  const compact = useBelowWidth(COMPACT);
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
      <Pro compact={compact} />
    </SiteChrome>
  );
}

function Section({ children, style, background }: { children: ReactNode; style?: object; background?: string }) {
  return (
    <View style={[styles.section, THEMED, background ? { backgroundColor: background } : null, style]}>
      <View style={styles.wrap}>{children}</View>
    </View>
  );
}

function Hero({ compact }: { compact: boolean }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const shots = useShots();
  return (
    <Section style={{ paddingTop: compact ? Spacing.four : 72, paddingBottom: compact ? Spacing.four : 40 }}>
      {/* Stacked, the phones must break the first screen on a small phone:
          a cut-off phone top is what says there is more below. Tighter
          rhythm than the other stacked sections, and the art plays at once
          rather than waiting to be scrolled into view. */}
      <View style={[styles.two, compact && styles.stack, compact && styles.heroStack]}>
        {/* The words arrive one line after another; the phones settle in a
          beat later and then drift, slowly and out of step with each other. */}
        <View style={[styles.copy, compact && styles.stackChild]}>
          <Reveal>
            <ThemedText type="smallBold" themeColor="tint" style={styles.eyebrow}>
              FLIGHT TRACKER · TRAVEL JOURNAL · EU261 CLAIMS
            </ThemedText>
          </Reveal>
          <Reveal delay={90}>
            <ThemedText
              role="heading"
              aria-level={1}
              themeColor="heading"
              style={[styles.h1, compact && styles.h1Compact]}>
              Your travel day, <ThemedText style={[styles.h1, compact && styles.h1Compact, { color: theme.tint }]}>live.</ThemedText>
            </ThemedText>
          </Reveal>
          <Reveal delay={180}>
            <ThemedText themeColor="textSecondary" style={[styles.lede, compact && styles.ledeCompact]}>
              Gates, delays and boarding, as they happen. Shared with the people waiting for you.
              And what you’re owed when the flight goes wrong.
            </ThemedText>
          </Reveal>
          <Reveal delay={270} style={styles.ctas}>
            <StoreBadges />
            <Link href="/check">
              <ThemedText type="linkPrimary">Check a flight →</ThemedText>
            </Link>
          </Reveal>
          <Reveal delay={340}>
            <ThemedText type="small" themeColor="textSecondary">
              Free to start · no account needed · EU &amp; UK rules
            </ThemedText>
          </Reveal>
        </View>
        <Reveal
          delay={200}
          distance={44}
          duration={1000}
          eager={compact}
          style={[styles.art, compact && styles.artCompact, compact && styles.stackChild]}>
          <Float period={6800} style={[styles.phoneBackPos, compact && styles.phoneBackCompact]}>
            {/* My travels on the day of a flight: the live card's running
              border, recorded from the release build in the page's theme. */}
            <Phone
              source={shots.journeys}
              width={compact ? 200 : 270}
              style={styles.phoneBackTilt}
              video={scheme === 'dark' ? '/video/journeys-dark.mp4' : '/video/journeys-light.mp4'}
            />
          </Float>
          <Float delay={1100} style={[styles.phoneFrontPos, compact && styles.phoneFrontCompact]}>
            {/* The globe turns: a loop cut from a real session on the phone,
              in the page's theme, over the still it would otherwise be. */}
            <Phone
              source={shots.world}
              width={compact ? 200 : 270}
              video={scheme === 'dark' ? '/video/world-dark.mp4' : '/video/world-light.mp4'}
            />
          </Float>
        </Reveal>
      </View>
    </Section>
  );
}

function Features({ compact }: { compact: boolean }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const shots = useShots();
  // The stage behind each phone: pale cobalt by day, the raised surface by night.
  const stage = scheme === 'dark' ? theme.backgroundSelected : '#E8F0FC';
  return (
    <Section>
      <ThemedText role="heading" aria-level={2} themeColor="heading" style={styles.h2}>
        The whole day, not just the delay
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.sub}>
        Flight trackers tell you your flight is late. FlyRight is with you from the taxi to the
        gate to the moment you land — and it remembers.
      </ThemedText>
      <View style={styles.features}>
        {FEATURES.map((feature, i) => (
          <View
            key={feature.title}
            style={[styles.feature, i % 2 === 1 && !compact && styles.featureReverse, compact && styles.stack]}>
            <Reveal
              from={compact ? 'up' : i % 2 === 1 ? 'right' : 'left'}
              distance={40}
              style={[
                styles.stage,
                THEMED,
                compact && styles.stageCompact,
                compact && styles.stackChild,
                feature.focus === 'bottom' && styles.stageFromTop,
                { backgroundColor: stage },
              ]}>
              <Phone
                source={shots[feature.shot]}
                width={compact ? 220 : 250}
                style={feature.focus === 'bottom' ? styles.stagePhoneBottom : styles.stagePhone}
              />
            </Reveal>
            <Reveal delay={140} style={[styles.featureCopy, compact && styles.stackChild]}>
              <ThemedText type="smallBold" themeColor="tint" style={styles.eyebrow}>
                {feature.eyebrow}
              </ThemedText>
              <ThemedText role="heading" aria-level={3} themeColor="heading" style={styles.h3}>
                {feature.title}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.featureBody}>
                {feature.body}
              </ThemedText>
            </Reveal>
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
        <Reveal style={[styles.copy, compact && styles.stackChild]}>
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
            ].map(([big, small], i) => (
              <Reveal key={big} delay={200 + i * 90} distance={20} style={[styles.stat, { backgroundColor: NIGHT.surface }]}>
                <ThemedText style={[styles.statBig, { color: NIGHT.green }]}>{big}</ThemedText>
                <ThemedText type="small" style={{ color: NIGHT.muted }}>
                  {small}
                </ThemedText>
              </Reveal>
            ))}
          </View>
        </Reveal>
        <Reveal
          from={compact ? 'up' : 'right'}
          distance={40}
          delay={120}
          style={[styles.checker, compact && styles.stackChild, { backgroundColor: NIGHT.surface }]}>
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
                style={({ hovered }) => [
                  styles.chip,
                  INTERACTIVE,
                  { backgroundColor: date === day ? '#4E9BF5' : hovered ? NIGHT.hover : NIGHT.field },
                ]}>
                <ThemedText type="smallBold" style={{ color: date === day ? '#FFFFFF' : NIGHT.text }}>
                  {label} · {formatDayLabel(day)}
                </ThemedText>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/check')}
              style={({ hovered }) => [styles.chip, INTERACTIVE, { backgroundColor: hovered ? NIGHT.hover : NIGHT.field }]}>
              <ThemedText type="smallBold" style={{ color: NIGHT.text }}>
                Another date
              </ThemedText>
            </Pressable>
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
        </Reveal>
      </View>
    </Section>
  );
}

function Pro({ compact }: { compact: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const price = proPriceFrom(useClientLocale());
  return (
    <Section style={{ paddingBottom: 72 }}>
      <Reveal
        distance={36}
        style={[
          styles.proBox,
          THEMED,
          compact && styles.stack,
          { backgroundColor: theme.backgroundElement, borderColor: theme.hairline },
        ]}>
        <View style={{ flex: 1.2, gap: Spacing.two }}>
          <ThemedText type="smallBold" themeColor="tint" style={styles.eyebrow}>
            FLYRIGHT PRO
          </ThemedText>
          <ThemedText role="heading" aria-level={2} themeColor="heading" style={styles.h2}>
            Pro when you travel. Your family follows free.
          </ThemedText>
          <View style={{ gap: 6, marginTop: Spacing.two }}>
            {[
              'Live gate, terminal, delay and belt updates where available',
              'Postcards for your people — they read and follow free',
              'Airline-ready claim letters and deadline reminders',
              'Inbound-aircraft predictions before departure',
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
            Monthly, annual and lifetime · available offers confirmed at checkout
          </ThemedText>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/go-pro')}
            style={({ hovered, pressed }) => [
              styles.button,
              INTERACTIVE,
              {
                backgroundColor: theme.tint,
                opacity: pressed ? 0.85 : 1,
                transform: [{ translateY: hovered ? -1 : 0 }, { scale: hovered ? 1.02 : 1 }],
              },
            ]}>
            <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
              Start free trial
            </ThemedText>
          </Pressable>
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
      </Reveal>
    </Section>
  );
}

/** A phone bezel around a capture. Width in points; the bezel keeps the
 * capture's 1206 × 2622 shape. */
function Phone({ source, width, style, video }: { source: number; width: number; style?: object; video?: string }) {
  const screen = [styles.phoneScreen, { borderRadius: width * 0.13 }];
  return (
    <View style={[styles.phone, { width, height: (width * 2622) / 1206, borderRadius: width * 0.16 }, style]}>
      {video ? (
        <PhoneVideo still={source} video={video} style={screen} />
      ) : (
        <Image source={source} style={screen} contentFit="cover" />
      )}
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
  heroStack: {
    gap: Spacing.three,
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
  ledeCompact: {
    fontSize: 17,
    lineHeight: 26,
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
    height: 440,
    width: '100%',
  },
  // Position on the Float wrapper (it owns the drifting translate), the tilt
  // on the phone itself — one transform each, nothing overwrites the other.
  phoneBackPos: {
    position: 'absolute',
    left: 0,
    top: 60,
  },
  phoneBackTilt: {
    transform: [{ rotate: '-6deg' }],
  },
  phoneBackCompact: {
    left: '6%',
    top: 28,
  },
  phoneFrontPos: {
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
  features: {
    gap: Spacing.four,
    marginTop: Spacing.five,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 48,
  },
  featureReverse: {
    flexDirection: 'row-reverse',
  },
  // The phone rises out of a rounded stage and is cropped by it — the top
  // of the screen is what carries each point; the tab bar does not.
  stage: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    height: 400,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  stageCompact: {
    height: 340,
    width: '100%',
  },
  stagePhone: {
    marginBottom: -150,
  },
  // `focus: 'bottom'`: the phone hangs from the top edge instead, its upper
  // part cropped, its lower part — and the bottom bezel — inside the stage.
  stageFromTop: {
    justifyContent: 'flex-start',
  },
  stagePhoneBottom: {
    marginTop: -210,
    marginBottom: 28,
  },
  featureCopy: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  h3: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 800,
    letterSpacing: -0.6,
  },
  featureBody: {
    fontSize: 17,
    lineHeight: 26,
    maxWidth: 440,
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
