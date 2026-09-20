import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { formatDayLabel, formatTime } from '@/services/dates';
import { tapLight, tapMedium } from '@/services/haptics';
import {
  DEFAULT_PLAN,
  FLIGHT_STAGES,
  STAGE_LABELS,
  STAGE_PROMPTS,
  nextStage as nextStageOf,
  canAdvanceTo,
  canRewindTo,
  hasLanded,
  isTravelerStage,
  landingDue,
  stageIndex,
  stageRules,
  type FlightFacts,
  type StagePlan,
  type TravelDayState,
  type TravelJourney,
  type TravelStage,
} from '@/services/travel-day';

const isFlightStage = (stage: TravelStage): boolean =>
  (FLIGHT_STAGES as readonly string[]).includes(stage);

/** Filled glyphs read as solid objects inside the node circles; the outline
 * variants looked like line art next to the bold labels. */
const STAGE_ICONS: Record<TravelStage, SymbolViewProps['name']> = {
  at_airport: { ios: 'location.fill', android: 'location_on', web: 'location_on' },
  checked_in: { ios: 'ticket.fill', android: 'confirmation_number', web: 'confirmation_number' },
  bag_dropped: { ios: 'suitcase.fill', android: 'luggage', web: 'luggage' },
  security: { ios: 'checkmark.shield.fill', android: 'verified_user', web: 'verified_user' },
  immigration: { ios: 'person.text.rectangle.fill', android: 'badge', web: 'badge' },
  boarded: { ios: 'airplane', android: 'flight', web: 'flight' },
  departed: { ios: 'airplane.departure', android: 'flight_takeoff', web: 'flight_takeoff' },
  landed: { ios: 'airplane.arrival', android: 'flight_land', web: 'flight_land' },
  arrival_immigration: { ios: 'person.text.rectangle.fill', android: 'badge', web: 'badge' },
  bags_collected: { ios: 'suitcase.rolling.fill', android: 'luggage', web: 'luggage' },
  bags_rechecked: { ios: 'suitcase.fill', android: 'luggage', web: 'luggage' },
};

const CHECK: SymbolViewProps['name'] = { ios: 'checkmark', android: 'check', web: 'check' };
const LOCK: SymbolViewProps['name'] = { ios: 'lock.fill', android: 'lock', web: 'lock' };
const LIVE_DATA: SymbolViewProps['name'] = {
  ios: 'antenna.radiowaves.left.and.right',
  android: 'sensors',
  web: 'sensors',
};

/** Diameter of a stage node. The rail, its fill and the sliding thumb are all
 * centered on the node column at the right edge of the card. */
const NODE = 32;
const RAIL_WIDTH = 2;
const SPRING = { damping: 18, stiffness: 170 } as const;
const POP_SPRING = { damping: 12, stiffness: 320 } as const;
const PRESS_SPRING = { damping: 15, stiffness: 300 } as const;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type NodeState = 'done' | 'current' | 'next' | 'open' | 'auto' | 'skipped' | 'locked';

/** The travel-day walk: flight facts up top, then the leg's stages (its
 * plan — the full airport walk for a flight on its own, transit security
 * and the gate plus the arrival steps for a connecting leg) as a vertical
 * stepper whose single status column sits on the RIGHT — label and caption
 * on the left, one node per stage on a rail. A tinted fill and a thumb
 * spring down the rail to the current stage; tapping ahead advances,
 * tapping an earlier stamped stage slides back to it. Flight-driven rows are
 * never tappable, `readOnly` renders the same view for followers, and
 * `locked` shows the steps before the travel window opens.
 *
 * The card is one accordion everywhere it appears: a small heading with the
 * latest step on the line under it, and a chevron. The trip screens open it
 * (it is what they are for); a follower's status sheet keeps it shut until
 * asked, so the posts and the leg lead. */
export function TravelDayTimeline({
  journey,
  state,
  facts,
  plan = DEFAULT_PLAN,
  readOnly = false,
  locked = false,
  unlocksAt,
  title = 'Trip progress',
  footer,
  onAdvance,
  onRewind,
  onUndo,
  action,
  defaultOpen = true,
  onToggle,
}: {
  journey: TravelJourney;
  state: TravelDayState;
  facts: FlightFacts;
  /** The stages this leg's walk has (stagePlan / stagePlanFor). */
  plan?: StagePlan;
  readOnly?: boolean;
  /** Pre-window preview: every stage shown but disabled. */
  locked?: boolean;
  /** When the window opens (T−24h) — shown in the locked caption. */
  unlocksAt?: Date;
  /** Card heading — "Upcoming trip" while locked, "Trip progress" once live. */
  title?: string;
  /** Optional copy under the steps (the trip summary before the window). */
  footer?: React.ReactNode;
  onAdvance?: (stage: TravelStage) => void;
  /** Slide back to an earlier stamped stage (drops the stamps after it). */
  onRewind?: (stage: TravelStage) => void;
  onUndo?: () => void;
  /** Optional header-row control — the traveler's share pill. */
  action?: React.ReactNode;
  /** Whether the steps show when the card first mounts. Each mount starts
   * here again: nothing remembers the last open or closed. */
  defaultOpen?: boolean;
  /** After a tap on the heading, the new state — a sheet scrolls the
   * opened steps into view with it. */
  onToggle?: (open: boolean) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  // When the steps last appeared. What is on the card as it opens is simply
  // there — the pop-in for a new gate and the caption fade are for news
  // that lands while the card is already open, not for opening it.
  const [quiet, setQuiet] = useState(true);
  useEffect(() => {
    if (!open || !quiet) return;
    const timer = setTimeout(() => setQuiet(false), 600);
    return () => clearTimeout(timer);
  }, [open, quiet]);
  const animateNews = !quiet;
  const toggle = () => {
    if (!open) setQuiet(true);
    setOpen(!open);
    onToggle?.(!open);
  };
  const interactive = !readOnly && !locked;
  const currentIndex = stageIndex(state.stage);
  // The walk happens at the departure airport, so its clock is the one the
  // traveler is living by — until they land, where the destination's takes
  // over. Neither follows the phone around.
  const departureZone = airportZone(journey.fromCode);
  const arrivalZone = airportZone(journey.toCode);
  // Journal trips have no status feed, so the traveler stamps departed/landed
  // too. A tracked flight's take-off stays data-only, but its landing is a tap
  // from the moment the wheels are up — no feed covers every airport — and the
  // arrival steps open with it. `overdue` only changes what the row SAYS, and
  // turns on with the clock, so the card ticks while it is up.
  const manualTrip = journey.source === 'manual';
  const now = useNow(60_000);
  const rules = stageRules(journey, state, facts, now, plan);
  const overdue = landingDue(journey, state, facts, now);

  // The one tap that's usually next: the first un-stamped tappable stage.
  const nextStage = interactive ? nextStageOf(state, rules) : null;

  // Each row reports its center Y (relative to the stages container); the
  // rail spans first-to-last center and the fill/thumb aim at the current
  // one, so the slider stays true through font scaling and label wraps.
  const [centers, setCenters] = useState<(number | undefined)[]>([]);
  const measured = plan.every((_, i) => centers[i] !== undefined);
  const railTop = measured ? centers[0]! : 0;
  const railHeight = measured ? centers[plan.length - 1]! - centers[0]! : 0;
  // The thumb sits on the current stage's row — or, for a stage the plan
  // doesn't show (stamped before the walk changed), the last row before it.
  const currentRow = plan.findLastIndex((s) => stageIndex(s) <= currentIndex);
  const target = measured && currentRow >= 0 ? centers[currentRow]! : railTop;

  const fillHeight = useSharedValue(0);
  const thumbY = useSharedValue(0);
  // First measurement snaps into place (reopening the screen mid-trip must
  // not replay the whole walk); stage changes after that spring.
  const settled = useRef(false);
  useEffect(() => {
    if (!measured) return;
    const fill = Math.max(0, target - railTop);
    const y = target - NODE / 2;
    if (!settled.current) {
      settled.current = true;
      fillHeight.value = fill;
      thumbY.value = y;
      return;
    }
    fillHeight.value = withSpring(fill, SPRING);
    thumbY.value = withSpring(y, SPRING);
  }, [measured, target, railTop, fillHeight, thumbY]);

  const fillStyle = useAnimatedStyle(() => ({ height: fillHeight.value }));
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateY: thumbY.value }] }));

  // The heading's second line: the step reached and when, in the airport's
  // clock where it happened — what the card says while shut.
  const stamped = state.stage ? state.stamps[state.stage] : null;
  const summary = state.stage
    ? [
        STAGE_LABELS[state.stage],
        stamped ? formatTime(stamped, hasLanded(state.stage) ? arrivalZone : departureZone) : null,
      ]
        .filter(Boolean)
        .join(' ')
    : locked
      ? 'Steps unlock 24 hours before departure'
      : 'Not started yet';

  const unlockLabel = unlocksAt
    ? `${formatDayLabel(unlocksAt.toISOString(), departureZone)} at ${formatTime(unlocksAt.toISOString(), departureZone)}`
    : null;

  return (
    <Card>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${title}: ${summary}`}
          testID="travel-day-toggle"
          onPress={toggle}
          style={({ pressed }) => [styles.heading, pressed && styles.pressed]}>
          {/* Locked, this is the upcoming-trip card: its title is the quiet
              uppercase eyebrow that card always had. */}
          {locked ? (
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
              {title.toUpperCase()}
            </ThemedText>
          ) : (
            <ThemedText themeColor="heading" style={styles.title}>
              {title}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {summary}
          </ThemedText>
        </Pressable>
        {action}
        {/* The chevron is the card's last word, right of any share controls. */}
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no"
          hitSlop={Spacing.three}
          onPress={toggle}
          style={({ pressed }) => pressed && styles.pressed}>
          <SymbolView
            name={
              open
                ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }
                : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }
            }
            size={14}
            tintColor={theme.textSecondary}
          />
        </Pressable>
      </View>

      {open && (
        <>
          {locked && (
            <ThemedView type="background" style={styles.lockedNote}>
              <SymbolView name={LOCK} size={14} tintColor={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.lockedText}>
                Steps unlock 24 hours before departure
                {unlockLabel ? ` — ${unlockLabel}` : ''}.
              </ThemedText>
            </ThemedView>
          )}

          <View style={[styles.stages, locked && styles.stagesLocked]}>
            {measured && (
              <>
                <View
                  style={[
                    styles.rail,
                    { top: railTop, height: railHeight, backgroundColor: theme.backgroundSelected },
                  ]}
                />
                {!locked && (
                  <Animated.View
                    style={[styles.railFill, { top: railTop, backgroundColor: theme.tint }, fillStyle]}
                  />
                )}
                {!locked && currentIndex >= 0 && (
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.thumb, { backgroundColor: theme.tint }, thumbStyle]}
                  />
                )}
              </>
            )}
            {plan.map((stage, index) => {
              const stamp = state.stamps[stage];
              const isCurrent = !locked && stage === state.stage;
              const reached = !locked && stamp !== undefined;
              const advanceable = interactive && !!onAdvance && canAdvanceTo(state, stage, rules);
              const rewindable = interactive && !!onRewind && canRewindTo(state, stage, rules);
              const tappable = advanceable || rewindable;
              const isNext = stage === nextStage;
              const skipped = !locked && !reached && stageIndex(stage) < currentIndex;
              // Tracked flights stamp these from live data — say so on the row,
              // so the missing tap target reads as "automatic", not "broken".
              // The landing is both: it fills itself in when the airline says
              // so, and it is a tap in the meantime.
              const autoStamped =
                !manualTrip && !reached && !skipped && isFlightStage(stage) && !advanceable;
              const tappableLanding = !manualTrip && stage === 'landed' && advanceable;

              const nodeState: NodeState = locked
                ? 'locked'
                : isCurrent
                  ? 'current'
                  : reached
                    ? 'done'
                    : skipped
                      ? 'skipped'
                      : autoStamped
                        ? 'auto'
                        : isNext
                          ? 'next'
                          : 'open';

              // The next step reads as its action ("I'm on board"), the rest as
              // plain labels. The accessible name must contain this same string —
              // announcing text that differs from what's shown fails label-in-name.
              const rowLabel = advanceable && isNext ? STAGE_PROMPTS[stage] : STAGE_LABELS[stage];
              const labelColor =
                nodeState === 'current'
                  ? theme.tint
                  : nodeState === 'done'
                    ? theme.heading
                    : nodeState === 'next'
                      ? theme.heading
                      : theme.textSecondary;

              const caption = reached
                ? formatTime(stamp, hasLanded(stage) ? arrivalZone : departureZone)
                : skipped
                  ? 'Skipped'
                  : tappableLanding && !readOnly
                    ? overdue
                      ? 'No arrival reported — tap when you are down'
                      : 'Fills in from live flight data — or tap when you land'
                    : autoStamped && !readOnly
                      ? 'Fills in from live flight data'
                      : null;

              // A landing the traveller called themselves is theirs to take
              // back; one the airline reported is not (rules.mayStampLanding
              // goes false the moment an actual arrival lands).
              const undoable =
                manualTrip || isTravelerStage(stage) || (stage === 'landed' && !!rules.mayStampLanding);
              const showUndo = isCurrent && interactive && !!onUndo && undoable;

              const onRowLayout = (e: LayoutChangeEvent) => {
                const { y, height } = e.nativeEvent.layout;
                const center = y + height / 2;
                setCenters((prev) => {
                  if (prev[index] === center) return prev;
                  const next = [...prev];
                  next[index] = center;
                  return next;
                });
              };

              const rowContent = (
                <>
                  <View style={styles.rowText}>
                    <ThemedText
                      type={nodeState === 'current' || nodeState === 'next' ? 'smallBold' : 'small'}
                      style={{ color: labelColor }}>
                      {rowLabel}
                    </ThemedText>
                    {(caption || showUndo) && (
                      <Animated.View
                        entering={animateNews ? FadeInDown.duration(220) : undefined}
                        style={styles.captionRow}>
                        {caption && (
                          <ThemedText type="small" themeColor="textSecondary">
                            {caption}
                          </ThemedText>
                        )}
                        {showUndo && (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Undo last step"
                            hitSlop={Spacing.two}
                            onPress={onUndo}>
                            <ThemedText type="small" style={{ color: theme.tint }}>
                              {caption ? '· Undo' : 'Undo'}
                            </ThemedText>
                          </Pressable>
                        )}
                      </Animated.View>
                    )}
                  </View>
                  <StageNode state={nodeState} icon={STAGE_ICONS[stage]} />
                </>
              );

              // Tappable rows are Pressables; the rest are plain Views — an iOS
              // Pressable flattens its children into one accessibility label,
              // which would swallow the nested Undo button.
              if (!tappable) {
                return (
                  <View
                    key={stage}
                    style={styles.stageRow}
                    onLayout={onRowLayout}
                    accessibilityState={locked ? { disabled: true } : undefined}>
                    {rowContent}
                  </View>
                );
              }
              return (
                <StageRow
                  key={stage}
                  label={advanceable ? rowLabel : `Go back to ${rowLabel}`}
                  onLayout={onRowLayout}
                  onPress={() => {
                    if (advanceable) {
                      tapMedium();
                      onAdvance!(stage);
                    } else {
                      tapLight();
                      onRewind!(stage);
                    }
                  }}>
                  {rowContent}
                </StageRow>
              );
            })}
          </View>

          {footer}
        </>
      )}
    </Card>
  );
}

/** A stage's node on the rail. Its look is the whole status vocabulary:
 * done = filled check, current = filled icon (the thumb behind it is the
 * fill, so the highlight visibly travels), next = tinted ring, open = quiet
 * ring, auto = live-data mark, skipped = dashed ring, locked = muted disc.
 * Pops once with an overshoot the moment its stamp lands — the walk's little
 * celebration — and stays quiet on rewinds and on reopening the screen. */
function StageNode({ state, icon }: { state: NodeState; icon: SymbolViewProps['name'] }) {
  const theme = useTheme();
  const done = state === 'done' || state === 'current';
  const scale = useSharedValue(1);
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current) {
      scale.value = withSequence(withSpring(1.22, POP_SPRING), withSpring(1, SPRING));
    }
    wasDone.current = done;
  }, [done, scale]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  let backgroundColor: string = theme.backgroundElement;
  let borderColor: string = 'transparent';
  let borderStyle: 'solid' | 'dashed' = 'solid';
  let tint: string = theme.textSecondary;
  let glyph = icon;
  let size = 15;
  let weight: SymbolViewProps['weight'] = 'semibold';

  switch (state) {
    case 'done':
      backgroundColor = theme.tint;
      tint = '#FFFFFF';
      glyph = CHECK;
      size = 14;
      weight = 'bold';
      break;
    case 'current':
      // Transparent: the sliding thumb behind is the fill.
      backgroundColor = 'transparent';
      tint = '#FFFFFF';
      break;
    case 'next':
      borderColor = theme.tint;
      tint = theme.tint;
      break;
    case 'open':
      borderColor = theme.backgroundSelected;
      break;
    case 'auto':
      backgroundColor = theme.backgroundSelected;
      glyph = LIVE_DATA;
      size = 14;
      break;
    case 'skipped':
      borderColor = theme.backgroundSelected;
      borderStyle = 'dashed';
      tint = theme.backgroundSelected;
      break;
    case 'locked':
      backgroundColor = theme.backgroundSelected;
      break;
  }

  return (
    <Animated.View
      style={[
        styles.node,
        { backgroundColor, borderColor, borderStyle, borderWidth: borderColor === 'transparent' ? 0 : 2 },
        pop,
      ]}>
      <SymbolView name={glyph} size={size} weight={weight} tintColor={tint} />
    </Animated.View>
  );
}

/** Tappable stage row with press physics: a quick settle-in on touch, a
 * springy release — the stepper should feel like a physical control, not a
 * link. */
function StageRow({
  label,
  onPress,
  onLayout,
  children,
}: {
  label: string;
  onPress: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  const press = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.03 }],
    opacity: 1 - press.value * 0.1,
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onLayout={onLayout}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 90 });
      }}
      onPressOut={() => {
        press.value = withSpring(0, PRESS_SPRING);
      }}
      onPress={onPress}
      style={[styles.stageRow, style]}>
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  // A step up from the stage labels (16) so the heading reads as the
  // card's title, well short of the old 32pt one.
  title: {
    flexShrink: 1,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 700,
  },
  heading: {
    flex: 1,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.6,
  },
  eyebrow: {
    flexShrink: 1,
    letterSpacing: 1.2,
  },
  lockedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  lockedText: {
    flex: 1,
  },
  stages: {
    gap: Spacing.three,
  },
  stagesLocked: {
    opacity: 0.55,
  },
  rail: {
    position: 'absolute',
    right: (NODE - RAIL_WIDTH) / 2,
    width: RAIL_WIDTH,
    borderRadius: RAIL_WIDTH / 2,
  },
  railFill: {
    position: 'absolute',
    right: (NODE - RAIL_WIDTH) / 2,
    width: RAIL_WIDTH,
    borderRadius: RAIL_WIDTH / 2,
  },
  thumb: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
  },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: NODE,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
