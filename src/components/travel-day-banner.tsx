import { useHasPro } from '@/services/purchases';
import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AirlineLogo } from '@/components/airline-logo';
import { LiveDot } from '@/components/live-dot';
import { BORDER_WIDTH, RunningBorder } from '@/components/running-border';
import { SheenCard } from '@/components/sheen-card';
import { SplitFlapClock } from '@/components/split-flap-clock';
import { ThemedText } from '@/components/themed-text';
import { TravelStatsHeader, TravelStatsStrip } from '@/components/travel-stats-header';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useStepPlans } from '@/hooks/use-step-plans';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { trackEvent } from '@/services/analytics';
import { formatTime } from '@/services/dates';
import type { JourneyRow } from '@/services/journeys';
import { cityOf, type TravelStats } from '@/services/timeline';
import {
  activeJourney,
  liveContent,
  travelWindow,
  type LiveContent,
  type StagePlan,
  type TravelDayState,
  type TravelPhase,
} from '@/services/travel-day';
import { noteBoarding, noteLanded, noteTakeOff, noteWarning, tapLight } from '@/services/haptics';
import { liveMoments, rememberLive, type LiveMemory } from '@/services/live-moments';
import { factsFor } from '@/services/travel-day-lifecycle';
import { useTravelDayStates } from '@/services/travel-day-store';
import type { TripHeroGroup } from '@/services/trip-groups';
import { flagEmoji } from '@/services/travel-recap';

const SPRING = { damping: 18, stiffness: 170 } as const;
/** The plane glyph's box on the route line — its travel is the line minus this. */
const PLANE_SIZE = 16;
/** The live card's corner radius — the running border traces it exactly. */
const BORDER_RADIUS = Spacing.four;

/** The trip the home hero is showing live, if any: the soonest flight inside
 * its travel window (T−24h through landing), with its stage state. One
 * answer for the screen and the hero both. The first flight expands in place;
 * a later flight keeps a linked full row without a second live countdown. */
export function useHeroTrip(
  journeys: JourneyRow[],
  now: Date,
): { journey: JourneyRow; phase: 'reminder' | 'live'; state: TravelDayState; plan: StagePlan } | null {
  // Selection needs every trip's real stamps: with the empty default, a
  // morning flight whose landed stamp already closed its window wins on
  // departure time, then fails the phase check below and collapses the hero
  // to plain stats while a later trip is genuinely live.
  const pro = useHasPro();
  const stateOf = useTravelDayStates();
  const planOf = useStepPlans(journeys, stateOf);
  const active = activeJourney(journeys, now, stateOf, planOf);
  if (!pro || !active) return null;
  const state = stateOf(active.id);
  const plan = planOf(active.id);
  const phase: TravelPhase = travelWindow(active, state, now, plan).phase;
  if (phase !== 'reminder' && phase !== 'live') return null;
  return { journey: active, phase, state, plan };
}

/** The hero at the top of My travels. Every ordinary day it is the navy
 * all-time stats card. On a travel day (T−24h through landing) the live
 * flight takes the top of the screen as a light card — the trip rows'
 * surface, since it is today's trip — and the stats step down to a one-line
 * strip beneath it that keeps the navy, so the summary wears the same colour
 * every day and nobody has to relearn which card is which. Sharing a single
 * card used to read as one confusing object: lifetime kilometres under a
 * boarding pass. */
export type HeroTrip = NonNullable<ReturnType<typeof useHeroTrip>>;

type HomeHeroProps = {
  journeys: JourneyRow[];
  stats: TravelStats;
  /** Glance omits all-time stats on Updates and above a tabletop hinge. */
  variant?: 'full' | 'glance';
  /** Only undefined means the stats fallback; null intentionally shows none. */
  fallback?: ReactNode;
  /** Flights shares its selection and clock with the hero and full list row, so
   * arrival and connection handovers need no journal edit to refresh. */
  snapshot?: { hero: HeroTrip | null; now: Date };
  tripGroup?: TripHeroGroup;
  onViewTrip?: () => void;
};

export function HomeHero(props: HomeHeroProps) {
  return props.snapshot
    ? <HeroContent {...props} {...props.snapshot} />
    : <AutomaticHero {...props} />;
}

function AutomaticHero(props: HomeHeroProps) {
  const now = useNow(60_000);
  const hero = useHeroTrip(props.journeys, now);
  return <HeroContent {...props} hero={hero} now={now} />;
}

function HeroContent({
  stats, variant = 'full', fallback, hero, now, tripGroup, onViewTrip,
}: HomeHeroProps & { hero: HeroTrip | null; now: Date }) {
  const router = useRouter();
  const theme = useTheme();
  if (!hero) return <>{fallback === undefined ? <TravelStatsHeader stats={stats} /> : fallback}</>;
  const { journey: active, phase, state, plan } = hero;

  const facts = factsFor(active);
  const content = liveContent(active, state, facts, now, plan);
  const delayed = content.emphasis === 'delay';
  const statusColor = delayed ? theme.warning : theme.tint;
  const toneColor =
    content.tone === 'delay'
      ? theme.warning
      : content.tone === 'boarding' || content.tone === 'landed'
        ? theme.success
        : theme.tint;
  // What the ticket said, when the airline has moved a clock: struck through
  // under the time that now counts, as the trip screen and the rows do it.
  const depWas = movedFrom(active.scheduledDeparture, facts.estimatedDeparture, active.fromCode);
  const arrWas = movedFrom(active.scheduledArrival, facts.estimatedArrival, active.toCode);

  return (
    <View style={styles.stack}>
    {/* The border is the card's status: the brand's cobalt while the flight
        is running to plan, amber once the airline has posted a delay — the
        one colour cue a glance across the room can read. Once the flight is
        shown, a light runs clockwise around it, including the day-before reminder. */}
    <SheenCard style={[styles.card, { borderColor: `${statusColor}59` }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open travel day for ${content.title}`}
        testID="travel-day-banner"
        onPress={() =>
          router.push({
            pathname: '/journey/[id]',
            params: { id: active.id, from: active.fromCode, to: active.toCode },
          })
        }
        style={({ pressed }) => [styles.liveSection, pressed && styles.pressed]}>
        {/* The airline's mark, and what state the card is in: the late
            chip while half an hour or more behind, the live dot. */}
        <View style={styles.spacedRow}>
          {/* Which flight, beside the airline's mark — the Lock Screen
              leaves it out for the clock's sake; here there is room. */}
          <View style={styles.flightId}>
            <AirlineLogo number={active.number} carrier={active.carrier} size={28} />
            <ThemedText type="smallBold" themeColor="heading" numberOfLines={1} style={styles.flightNumber}>
              {content.flightLabel}
            </ThemedText>
          </View>
          <View style={styles.headerRight}>
            {content.delayChip && (
              <View style={[styles.delayChip, { backgroundColor: `${theme.warning}1F` }]}>
                <ThemedText type="smallBold" style={{ color: theme.warning }}>
                  {content.delayChip}
                </ThemedText>
              </View>
            )}
            {phase === 'live' && <LiveDot />}
          </View>
        </View>

        {/* The one time fact, big, and the one place fact beside it — the
            same rule the Lock Screen card and the Dynamic Island follow
            (convex/liveShared.ts liveLead): terminal, then the check-in
            desk, the gate, the seat once on board, the belt after landing. */}
        <View style={styles.leadRow}>
          <View style={styles.clockBlock}>
            <View style={styles.clockLabelRow}>
              <SymbolView name={clockIcon(content.clockLabel)} size={12} tintColor={toneColor} />
              <ThemedText type="smallBold" style={[styles.clockLabel, { color: toneColor }]}>
                {content.clockLabel}
              </ThemedText>
            </View>
            <HeroClock
              end={content.countdownEnd}
              now={now}
              delayed={content.tone === 'delay'}
              wordsColor={theme.heading}
              fallback={content.tone === 'landed' ? cityOf(active.toCode) : content.headline}
            />
          </View>
          {content.lead && (
            <View style={styles.leadFacts}>
              {/* Two facts stacked (liveLead): the first in the status
                  colour — it is the one to act on — the second under it.
                  Side by side, the board left them too little width and
                  "TERMINAL" / "Area 2" truncated. */}
              <View style={styles.leadPair}>
                <LeadFact
                  label={content.lead.label}
                  value={content.lead.value}
                  pair={!!content.second}
                  color={toneColor}
                />
                {content.second && (
                  <LeadFact label={content.second.label} value={content.second.value} pair color={theme.heading} />
                )}
              </View>
              {!!content.lead.sub && (
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  numberOfLines={1}
                  style={[styles.leadSub, content.lead.subStruck && styles.struck]}>
                  {content.lead.sub}
                </ThemedText>
              )}
            </View>
          )}
        </View>

        {/* The route as one line: the codes with the clocks the airline now
            says (the ticketed ones struck through when moved), and the
            contrail the plane flies as the flight goes. */}
        <View style={styles.routeRow}>
          <View style={styles.endpoint}>
            <ThemedText themeColor="heading" style={styles.code} numberOfLines={1}>
              {content.fromCode}
            </ThemedText>
            {!!content.depTime && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.codeTime}>
                {content.depTime}
              </ThemedText>
            )}
            {depWas && <MovedFrom clock={depWas} />}
          </View>
          <RoutePath progress={content.progress} delayed={delayed} />
          <View style={[styles.endpoint, styles.endpointRight]}>
            <ThemedText themeColor="heading" style={styles.code} numberOfLines={1}>
              {content.toCode}
            </ThemedText>
            {!!content.arrTime && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.codeTime}>
                {content.arrTime}
              </ThemedText>
            )}
            {arrWas && <MovedFrom clock={arrWas} />}
          </View>
        </View>

        <View style={[styles.footerRow, { borderTopColor: theme.hairline }]}>
          {/* The pass, one tap from the home screen on the day: the gate
              is where a hand reaches for the phone (screens/boarding-pass). */}
          {!!active.passCode && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show boarding pass"
              testID="hero-boarding-pass"
              hitSlop={Spacing.one}
              onPress={() => {
                tapLight();
                trackEvent('boarding_pass_opened', { from: 'home' });
                router.push({ pathname: '/boarding-pass', params: { journeyId: active.id } });
              }}
              style={({ pressed }) => [
                styles.passPill,
                { backgroundColor: `${theme.tint}1A`, opacity: pressed ? 0.7 : 1 },
              ]}>
              <SymbolView
                name={{ ios: 'qrcode', android: 'qr_code_2', web: 'qr_code_2' }}
                size={14}
                tintColor={theme.tint}
              />
              <ThemedText type="smallBold" style={[styles.passPillText, { color: theme.tint }]}>
                Pass
              </ThemedText>
            </Pressable>
          )}
          <ThemedText type="small" themeColor="textSecondary" style={styles.openTrip}>
            Open trip
          </ThemedText>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={14}
            tintColor={theme.textSecondary}
          />
        </View>
      </Pressable>

      {tripGroup && onViewTrip && (
        <Pressable
          testID="hero-view-in-trip"
          accessibilityRole="button"
          accessibilityLabel={`View ${tripGroup.group.title} in trip`}
          onPress={() => { tapLight(); onViewTrip(); }}
          style={({ pressed }) => [styles.groupLink, { borderTopColor: theme.hairline }, pressed && styles.pressed]}>
          <ThemedText type="smallBold" themeColor="heading" style={styles.groupName}>
            {flagEmoji(tripGroup.group.country)} {tripGroup.group.title}
          </ThemedText>
          <View style={styles.groupAction}>
            <ThemedText type="smallBold" themeColor="tint" style={styles.groupActionLabel}>View in trip</ThemedText>
            <SymbolView name={{ ios: 'arrow.down', android: 'arrow_downward', web: 'arrow_downward' }} size={12} tintColor={theme.tint} />
          </View>
        </Pressable>
      )}

      {/* Keyed by journey so a hero handover never inherits the previous
       * flight's delay/gate memory and false-flashes. */}
      <StatusFlash key={active.id} content={content} />
      <RunningBorder color={statusColor} radius={BORDER_RADIUS} running />
    </SheenCard>
    {variant === 'full' && <TravelStatsStrip stats={stats} />}
    </View>
  );
}

/** The clock label's glyph: the take-off until the wheels are up, the
 * landing in the air, a tick once down. */
function clockIcon(label: string): SymbolViewProps['name'] {
  if (label.startsWith('LANDS')) return { ios: 'airplane.arrival', android: 'flight_land', web: 'flight_land' };
  if (label.startsWith('LANDED')) return { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' };
  return { ios: 'airplane.departure', android: 'flight_takeoff', web: 'flight_takeoff' };
}

/** The big countdown: the split-flap board — hours, minutes and seconds on
 * tiles that flip as they change, the units marked under them — as the Lock
 * Screen card and the Home Screen widget draw it. Once the moment has passed
 * (or there is none) it shows the fallback words instead of a frozen 00:00.
 * `now` is the hero's clock; the board ticks on its own second. */
function HeroClock({
  end, now, delayed, wordsColor, fallback,
}: { end: number | null; now: Date; delayed: boolean; wordsColor: string; fallback: string }) {
  const theme = useTheme();
  const tick = useNow(1_000);
  const left = end === null ? NaN : end - tick.getTime();
  if (!(left > 0)) {
    return (
      <ThemedText numberOfLines={1} style={[styles.clockWords, clockWordsSize(fallback), { color: delayed ? theme.warning : wordsColor }]}>
        {fallback}
      </ThemedText>
    );
  }
  // The hero re-renders on its own minute clock too; the face takes the
  // later of the two so a fresh mount never shows a stale second.
  return <SplitFlapClock end={end!} now={Math.max(now.getTime(), tick.getTime())} height={34} digitColor={delayed ? theme.warning : undefined} />;
}

/** The ticketed clock, formatted in its airport's zone, when the airline's
 * estimate has moved it to a different minute — null while they agree, so
 * nothing is struck through for a flight running to plan. */
function movedFrom(scheduled: string, estimated: string | null, code: string): string | null {
  if (!estimated) return null;
  const zone = airportZone(code);
  const was = formatTime(scheduled, zone);
  return was === formatTime(estimated, zone) ? null : was;
}

/** What the ticket said before the airline moved the flight — struck through
 * and quiet under the live clock, so a traveller who wrote 11:30 in their
 * calendar can see we know it said 11:30. */
function MovedFrom({ clock }: { clock: string }) {
  return (
    <ThemedText
      type="small"
      themeColor="textSecondary"
      style={styles.codeTimeWas}
      numberOfLines={1}
      accessibilityLabel={`Moved from ${clock}`}>
      {clock}
    </ThemedText>
  );
}

/** Status changes should land, not repaint. A new or grown delay washes the
 * card amber once with a warning haptic; a gate change gets a light tick (the
 * fact line's re-entry handles the visual). The travel day's big steps play
 * their own patterns — two beeps at boarding, the roll at take-off, and a
 * green wash with the touchdown at landing. One haptic per change, the
 * biggest, so a landing that also revises the delay doesn't stutter. Mount
 * is silent — old news (see liveMoments). */
function StatusFlash({ content }: { content: LiveContent }) {
  const warn = useSharedValue(0);
  const good = useSharedValue(0);
  const memory = useRef<LiveMemory | null>(null);
  const { delayLabel, gate, tone, countdownKind } = content;

  useEffect(() => {
    const next = { delayLabel, gate, tone, countdownKind };
    if (!memory.current) {
      memory.current = rememberLive(next);
      return;
    }
    const { moments, memory: remembered } = liveMoments(memory.current, next);
    memory.current = remembered;
    if (!moments.length) return;

    const flash = (value: SharedValue<number>) => {
      value.value = withSequence(
        withTiming(0.16, { duration: 250 }),
        withTiming(0, { duration: 700 }),
      );
    };
    if (moments.includes('landed')) flash(good);
    if (moments.includes('delay')) flash(warn);

    if (moments.includes('landed')) noteLanded();
    else if (moments.includes('takeOff')) noteTakeOff();
    else if (moments.includes('boarding')) noteBoarding();
    else if (moments.includes('delay')) noteWarning();
    else if (moments.includes('gate')) tapLight();
  }, [delayLabel, gate, tone, countdownKind, warn, good]);

  const theme = useTheme();
  const warnStyle = useAnimatedStyle(() => ({ opacity: warn.value }));
  const goodStyle = useAnimatedStyle(() => ({ opacity: good.value }));
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.wash, { backgroundColor: theme.warning }, warnStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.wash, { backgroundColor: theme.success }, goodStyle]}
      />
    </>
  );
}

/** The dotted contrail joining the route codes, with the plane riding it as
 * the flight-progress indicator — the same motif the Live Activity draws, so
 * lock screen and hero read as one. The flown part turns solid behind the
 * plane; the first measurement snaps, later changes spring. */
function RoutePath({ progress, delayed }: { progress: number; delayed: boolean }) {
  const [width, setWidth] = useState(0);
  const planeX = useSharedValue(0);
  const settled = useRef(false);
  const travel = Math.max(0, width - PLANE_SIZE);

  useEffect(() => {
    if (!width) return;
    const target = progress * travel;
    if (!settled.current) {
      settled.current = true;
      planeX.value = target;
      return;
    }
    planeX.value = withSpring(target, SPRING);
  }, [width, progress, travel, planeX]);

  const planeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: planeX.value }] }));
  const flownStyle = useAnimatedStyle(() => ({ width: planeX.value + PLANE_SIZE / 2 }));
  const theme = useTheme();
  const tint = delayed ? theme.warning : theme.tint;

  return (
    <View style={styles.routePath} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.routeDots}>
        {Array.from({ length: 9 }, (_, i) => (
          <View
            key={i}
            style={[
              styles.routeDot,
              { backgroundColor: theme.textSecondary },
              (i === 0 || i === 8) && styles.routeEndDot,
            ]}
          />
        ))}
      </View>
      <Animated.View style={[styles.routeFlown, { backgroundColor: tint }, flownStyle]} />
      <Animated.View style={[styles.plane, planeStyle]}>
        <SymbolView
          name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
          size={PLANE_SIZE}
          tintColor={tint}
          style={Platform.OS === 'ios' ? undefined : styles.rotated}
        />
      </Animated.View>
    </View>
  );
}

/** The words in the clock's place (a city once landed, a short status):
 * sized by length for the same reason as the lead fact. */
function clockWordsSize(words: string) {
  if (words.length <= 10) return null;
  return words.length <= 16 ? { fontSize: 22, lineHeight: 28 } : { fontSize: 18, lineHeight: 24 };
}

/** One fact beside the board: its label over its value, right-aligned. */
function LeadFact({ label, value, pair, color }: { label: string; value: string; pair: boolean; color: string }) {
  return (
    <View style={styles.leadFact}>
      <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1} style={styles.leadLabel}>
        {label}
      </ThemedText>
      <ThemedText numberOfLines={1} style={[styles.leadValue, leadValueSize(value, pair), { color }]}>
        {value}
      </ThemedText>
    </View>
  );
}

/** The lead fact is always short — a gate, a desk, a seat, a belt — so its
 * size comes from its length, and is a step smaller when two share the room. adjustsFontSizeToFit drew it a few points tall
 * on iOS (React Native 0.86, below its own minimumFontScale): a shrink-wrapped
 * auto-fit text is fitted against no width at all. */
function leadValueSize(value: string, pair = false) {
  if (value.length <= 4) return pair ? { fontSize: 20, lineHeight: 24 } : null;
  if (value.length <= 7) return pair ? { fontSize: 18, lineHeight: 22 } : { fontSize: 20, lineHeight: 26 };
  return pair ? { fontSize: 15, lineHeight: 20 } : { fontSize: 16, lineHeight: 24 };
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.9,
  },
  stack: {
    gap: Spacing.two,
  },
  // The wash overlay is clipped to the rounded corners; SheenCard supplies
  // the surface, border and radius.
  // Tighten padding and gaps, not the countdown or gate. The group shortcut
  // stays a separate 44pt target rather than nesting inside Open trip.
  card: {
    overflow: 'hidden',
    borderWidth: BORDER_WIDTH,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    gap: Spacing.one,
  },
  liveSection: {
    gap: Spacing.one,
  },
  spacedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  routeRow: {
    flexDirection: 'row',
    // Top-aligned so the path sits on the codes' midline however many clock
    // lines hang under them (a moved flight shows two).
    alignItems: 'flex-start',
    gap: Spacing.three,
    marginTop: 0,
    // On wide windows (tablet, unfolded foldable) an unclamped contrail
    // strands the airport codes at the card's far edges — cap the route to a
    // boarding-pass-plausible width. No-op on phones.
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
  // The route is the supporting line now; the clock and the fact lead.
  code: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: 800,
    letterSpacing: 0.5,
  },
  flightId: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  flightNumber: {
    fontSize: 14,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  delayChip: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 2,
  },
  leadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  // The clock keeps its width; a long fact beside it shrinks instead.
  clockBlock: {
    flexShrink: 0,
    gap: Spacing.half,
  },
  clockLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  clockLabel: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.4,
  },
  clockWords: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 800,
    letterSpacing: -0.5,
  },
  leadFacts: {
    flex: 1,
    // Never crushed to a column of letters beside the board: the values
    // shrink by their length instead (leadValueSize).
    minWidth: 64,
    alignItems: 'flex-end',
    gap: Spacing.half,
  },
  leadPair: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  leadFact: {
    alignItems: 'flex-end',
  },
  leadLabel: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.3,
  },
  leadValue: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: 800,
  },
  // "Boards 2:30 PM" in the room the board leaves it.
  // A boarding time the delay has overtaken.
  struck: { textDecorationLine: 'line-through' },
  leadSub: {
    fontSize: 11,
    lineHeight: 14,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.one,
  },
  groupLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  groupName: { flex: 1, fontSize: 12, lineHeight: 16 },
  groupAction: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, maxWidth: '45%' },
  groupActionLabel: { fontSize: 12, lineHeight: 16, flexShrink: 1 },
  openTrip: {
    flex: 1,
  },
  codeTime: {
    fontVariant: ['tabular-nums'],
  },
  codeTimeWas: {
    fontVariant: ['tabular-nums'],
    textDecorationLine: 'line-through',
  },
  routePath: {
    flex: 1,
    height: PLANE_SIZE,
    justifyContent: 'center',
    // (40pt code line − 16pt plane) / 2: the path on the codes' midline.
    marginTop: 12,
  },
  routeDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.55,
  },
  routeEndDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 1,
  },
  routeFlown: {
    position: 'absolute',
    left: 0,
    height: 2,
    borderRadius: 1,
    opacity: 0.7,
  },
  plane: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: PLANE_SIZE,
    height: PLANE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotated: {
    transform: [{ rotate: '90deg' }],
  },
  passPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.four,
  },
  passPillText: {
    fontSize: 13,
    lineHeight: 18,
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});

export { LiveDot };
