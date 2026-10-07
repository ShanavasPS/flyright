import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Card } from '@/components/card';
import { STAGE_ICONS } from '@/components/travel-day-timeline';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { tapLight, tapMedium } from '@/services/haptics';
import {
  DEFAULT_PLAN,
  FLIGHT_STAGES,
  STAGE_LABELS,
  canAdvanceTo,
  canRewindTo,
  isTravelerStage,
  nextStage as nextStageOf,
  stageIndex,
  stageRules,
  type FlightFacts,
  type StagePlan,
  type TravelDayState,
  type TravelJourney,
  type TravelStage,
} from '@/services/travel-day';

/** Width of one step: room for "Through security" on two lines. */
const STEP = 84;
const DOT = 30;

/** A tap on a step plays out before the row moves on: the line sweeps up
 * to the step, the dot fills, then the strip scrolls to the one after.
 * The line is two halves owned by neighbouring steps; each takes LINE_MS
 * so the whole segment sweeps in twice that, then the dot takes DOT_MS. */
const LINE_MS = 120;
const DOT_MS = 240;
const REACH_MS = LINE_MS * 2 + DOT_MS;
const SCROLL_AFTER_MS = REACH_MS + 320;

const isFlightStage = (stage: TravelStage): boolean => (FLIGHT_STAGES as readonly string[]).includes(stage);

/** Trip progress on the trip page during the travel window: the leg's steps
 * (its plan — services/travel-day) in one row that scrolls sideways, so a
 * long walk keeps its full labels. Done steps carry a tick, the next one a
 * ring; the header's pill marks the next step done, and a tap on a step does
 * what it does in the full timeline (components/travel-day-timeline): ahead
 * advances, an earlier stamped step slides back, the current one undoes.
 * Take-off and landing come from flight data where the flight is tracked.
 * Each step wears its icon. The row opens scrolled to the next step; the
 * header's expand button opens the full progress screen, where the steps
 * can be edited. */
export function TravelProgressStrip({
  journey,
  state,
  facts,
  plan = DEFAULT_PLAN,
  onAdvance,
  onRewind,
  onUndo,
  onExpand,
}: {
  journey: TravelJourney;
  state: TravelDayState;
  facts: FlightFacts;
  plan?: StagePlan;
  onAdvance: (stage: TravelStage) => void;
  onRewind: (stage: TravelStage) => void;
  onUndo: () => void;
  /** Opens the full trip progress screen. */
  onExpand?: () => void;
}) {
  const theme = useTheme();
  const now = useNow(60_000);
  const scroll = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const rules = stageRules(journey, state, facts, now, plan);
  const next = nextStageOf(state, rules);
  const currentIndex = stageIndex(state.stage);
  const manualTrip = journey.source === 'manual';
  const reachedCount = plan.filter((s) => state.stamps[s] !== undefined).length;
  // The step to keep in view: the next one, else the current one.
  const focus = next ?? state.stage;
  const focusAt = Math.max(0, plan.findIndex((s) => s === focus));

  // After a step is marked, the row waits for the step to fill before it
  // scrolls on — the traveller sees what they just did. Everything else
  // (opening, an undo, a resize) snaps. While it plays out, the step after
  // is not yet "next": its ring and bold label arrive with the scroll, not
  // on the tap.
  const reducedMotion = useReducedMotion();
  const reachedBefore = useRef(reachedCount);
  const [settling, setSettling] = useState(false);
  useEffect(() => {
    if (!width) return;
    const stamped = reachedCount > reachedBefore.current;
    reachedBefore.current = reachedCount;
    const go = () => scroll.current?.scrollTo({ x: Math.max(0, (focusAt - 1) * STEP), animated: stamped });
    if (!stamped || reducedMotion) {
      go();
      return;
    }
    setSettling(true);
    const timer = setTimeout(() => {
      setSettling(false);
      go();
    }, SCROLL_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setSettling(false);
    };
  }, [focusAt, width, reachedCount, reducedMotion]);
  const shownNext = settling ? null : next;

  const undoable =
    !!state.stage &&
    (manualTrip || isTravelerStage(state.stage) || (state.stage === 'landed' && !!rules.mayStampLanding));

  return (
    <Card testID="trip-progress">
      <View style={styles.header}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow} numberOfLines={1}>
          {`PROGRESS · ${reachedCount}/${plan.length}`}
        </ThemedText>
        {onExpand && <ProgressExpandButton onPress={onExpand} />}
      </View>

      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        snapToInterval={STEP}
        decelerationRate="fast"
        contentContainerStyle={styles.strip}
        style={styles.stripScroll}>
        {plan.map((stage, i) => {
          const reached = state.stamps[stage] !== undefined;
          const isCurrent = stage === state.stage;
          const isNext = stage === shownNext;
          const skipped = !reached && stageIndex(stage) < currentIndex;
          const advanceable = canAdvanceTo(state, stage, rules);
          const rewindable = canRewindTo(state, stage, rules);
          const auto = !manualTrip && isFlightStage(stage) && !reached && !advanceable;
          const press = () => {
            if (isCurrent && undoable) {
              tapLight();
              onUndo();
            } else if (advanceable) {
              tapMedium();
              onAdvance(stage);
            } else if (rewindable) {
              tapLight();
              onRewind(stage);
            }
          };
          const label = STAGE_LABELS[stage];
          const status = reached ? 'done' : skipped ? 'skipped' : isNext ? 'next' : auto ? 'from flight data' : 'to do';
          const tappable = (isCurrent && undoable) || advanceable || rewindable;
          return (
            <Pressable
              key={stage}
              testID={`trip-progress-${stage}`}
              accessibilityRole={tappable ? 'button' : 'text'}
              accessibilityLabel={`${label}, ${status}`}
              accessibilityHint={
                isCurrent && undoable ? 'Undo this step' : advanceable ? 'Mark this step done' : rewindable ? 'Go back to this step' : undefined
              }
              disabled={!tappable}
              onPress={press}
              style={styles.step}>
              <Track
                stage={stage}
                reached={reached}
                lineIn={i > 0 && (reached || isCurrent)}
                lineOut={i < plan.length - 1 && reached && stageIndex(plan[i + 1]) <= currentIndex}
                first={i === 0}
                last={i === plan.length - 1}
                ring={isNext ? theme.tint : theme.backgroundSelected}
                dashed={skipped}
                iconTint={isNext ? theme.tint : theme.textSecondary}
                auto={auto}
              />
              <ThemedText
                type={isNext || isCurrent ? 'smallBold' : 'small'}
                themeColor={reached || isNext || isCurrent ? 'heading' : 'textSecondary'}
                style={styles.label}
                numberOfLines={2}>
                {label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </Card>
  );
}

/** A step's line and dot. Reaching a step is animated in order — the half
 * line out of the step before, the half line into this one, then the dot
 * fills and its tick lands — so a tap reads as travel along the row.
 * Losing a step (undo, a rewind) snaps back; so does the first paint. */
function Track({
  stage,
  reached,
  lineIn,
  lineOut,
  first,
  last,
  ring,
  dashed,
  iconTint,
  auto,
}: {
  stage: TravelStage;
  reached: boolean;
  lineIn: boolean;
  lineOut: boolean;
  first: boolean;
  last: boolean;
  ring: string;
  dashed: boolean;
  iconTint: string;
  auto: boolean;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const inFill = useSharedValue(lineIn ? 1 : 0);
  const outFill = useSharedValue(lineOut ? 1 : 0);
  const dotFill = useSharedValue(reached ? 1 : 0);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const easing = Easing.out(Easing.cubic);
    const to = (value: typeof inFill, on: boolean, delay: number, ms: number) => {
      const target = on ? 1 : 0;
      if (value.value === target) return;
      if (!on || reducedMotion) {
        value.value = target;
        return;
      }
      value.value = withDelay(delay, withTiming(1, { duration: ms, easing }));
    };
    // The line out of the previous step fills first (its own Track animates
    // it, on the same clock), then the line in, then the dot.
    to(outFill, lineOut, 0, LINE_MS);
    to(inFill, lineIn, LINE_MS, LINE_MS);
    to(dotFill, reached, LINE_MS * 2, DOT_MS);
  }, [lineIn, lineOut, reached, inFill, outFill, dotFill, reducedMotion]);

  const inStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: inFill.value }] }));
  const outStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: outFill.value }] }));
  const dotStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(dotFill.value, [0, 1], ['transparent', theme.success]),
    borderColor: interpolateColor(dotFill.value, [0, 1], [ring, theme.success]),
  }));
  const doneIconStyle = useAnimatedStyle(() => ({ opacity: dotFill.value }));
  const tickStyle = useAnimatedStyle(() => ({
    opacity: dotFill.value,
    transform: [{ scale: 0.4 + 0.6 * dotFill.value }],
  }));

  return (
    <View style={styles.track}>
      <View style={[styles.line, { backgroundColor: first ? 'transparent' : theme.backgroundSelected }]}>
        {!first && <Animated.View style={[styles.lineFill, { backgroundColor: theme.success }, inStyle]} />}
      </View>
      <Animated.View style={[styles.dot, { borderStyle: dashed ? 'dashed' : 'solid' }, dotStyle]}>
        <SymbolView name={STAGE_ICONS[stage]} size={13} tintColor={iconTint} />
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, doneIconStyle]}>
          <SymbolView name={STAGE_ICONS[stage]} size={13} tintColor="#FFFFFF" />
        </Animated.View>
        {reached && (
          <Animated.View style={[styles.tick, { backgroundColor: theme.success, borderColor: theme.backgroundElement }, tickStyle]}>
            <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={7} weight="heavy" tintColor="#FFFFFF" />
          </Animated.View>
        )}
        {auto && (
          <View style={[styles.tick, { backgroundColor: theme.backgroundSelected, borderColor: theme.backgroundElement }]}>
            <SymbolView
              name={{ ios: 'antenna.radiowaves.left.and.right', android: 'sensors', web: 'sensors' }}
              size={7}
              tintColor={theme.textSecondary}
            />
          </View>
        )}
      </Animated.View>
      <View style={[styles.line, { backgroundColor: last ? 'transparent' : theme.backgroundSelected }]}>
        {!last && <Animated.View style={[styles.lineFill, { backgroundColor: theme.success }, outStyle]} />}
      </View>
    </View>
  );
}

/** The round button that opens the full trip progress screen — on the
 * strip, and on the finished trip's record. */
export function ProgressExpandButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      testID="trip-progress-expand"
      accessibilityRole="button"
      accessibilityLabel="Open trip progress"
      accessibilityHint="See every step and add or remove steps"
      hitSlop={Spacing.two}
      onPress={() => {
        tapLight();
        onPress();
      }}
      style={({ pressed }) => [styles.expand, { backgroundColor: theme.backgroundSelected }, pressed && styles.pressed]}>
      <SymbolView
        name={{ ios: 'arrow.up.left.and.arrow.down.right', android: 'open_in_full', web: 'open_in_full' }}
        size={13}
        weight="semibold"
        tintColor={theme.tint}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    minHeight: 32,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1,
    flexShrink: 0,
  },
  pressed: {
    opacity: 0.7,
  },
  expand: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  tick: {
    position: 'absolute',
    right: -5,
    bottom: -5,
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripScroll: {
    marginHorizontal: -Spacing.four,
  },
  strip: {
    paddingHorizontal: Spacing.four - (STEP - DOT) / 2 + Spacing.two,
  },
  step: {
    width: STEP,
    minHeight: 64,
    alignItems: 'center',
    gap: 6,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  line: {
    flex: 1,
    height: 2,
  },
  lineFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    right: 0,
    transformOrigin: 'left',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    textAlign: 'center',
    paddingHorizontal: 2,
    fontSize: 12,
    lineHeight: 15,
  },
});
