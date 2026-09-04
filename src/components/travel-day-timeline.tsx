import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayLabel, formatTime, localDateString } from '@/services/dates';
import { tapLight, tapMedium } from '@/services/haptics';
import {
  FLIGHT_STAGES,
  STAGE_LABELS,
  STAGE_ORDER,
  STAGE_PROMPTS,
  nextStage as nextStageOf,
  canAdvanceTo,
  canRewindTo,
  stageIndex,
  type FlightFacts,
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

/** The travel-day walk: flight facts up top, then the eight stages as a
 * vertical stepper whose single status column sits on the RIGHT — label and
 * caption on the left, one node per stage on a rail. A tinted fill and a
 * thumb spring down the rail to the current stage; tapping ahead advances,
 * tapping an earlier stamped stage slides back to it. Flight-driven rows are
 * never tappable, `readOnly` renders the same view for followers, and
 * `locked` shows the steps before the travel window opens. */
export function TravelDayTimeline({
  journey,
  state,
  facts,
  readOnly = false,
  locked = false,
  unlocksAt,
  title = 'Travel day',
  footer,
  onAdvance,
  onRewind,
  onUndo,
  action,
}: {
  journey: TravelJourney;
  state: TravelDayState;
  facts: FlightFacts;
  readOnly?: boolean;
  /** Pre-window preview: every stage shown but disabled. */
  locked?: boolean;
  /** When the window opens (T−24h) — shown in the locked caption. */
  unlocksAt?: Date;
  /** Card heading — "Upcoming trip" while locked, "Travel day" once live. */
  title?: string;
  /** Optional copy under the steps (the trip summary before the window). */
  footer?: React.ReactNode;
  onAdvance?: (stage: TravelStage) => void;
  /** Slide back to an earlier stamped stage (drops the stamps after it). */
  onRewind?: (stage: TravelStage) => void;
  onUndo?: () => void;
  /** Optional header-row control — the traveler's share pill. */
  action?: React.ReactNode;
}) {
  const theme = useTheme();
  const interactive = !readOnly && !locked;
  const currentIndex = stageIndex(state.stage);
  const factsWithData = journey.source === 'lookup';
  // Journal trips have no status feed, so the traveler stamps departed/landed
  // too; tracked flights keep those data-only (and say so on the row).
  const manualTrip = journey.source === 'manual';

  const chips: { label: string; value: string; tone?: 'danger' }[] = [];
  if (!locked) {
    if (facts.delayMinutes != null && facts.delayMinutes >= 30) {
      chips.push({ label: 'Delay', value: `${facts.delayMinutes} min`, tone: 'danger' });
    }
    if (facts.gate) chips.push({ label: 'Gate', value: facts.gate });
    if (facts.terminal) chips.push({ label: 'Terminal', value: facts.terminal });
    if (facts.checkInDesk) chips.push({ label: 'Check-in', value: facts.checkInDesk });
    if (facts.boardingTime) chips.push({ label: 'Boarding', value: formatTime(facts.boardingTime) });
    if (state.stage === 'landed' && facts.baggageBelt) {
      chips.push({ label: 'Baggage', value: facts.baggageBelt });
    }
  }

  // The one tap that's usually next: the first un-stamped tappable stage.
  const nextStage = interactive ? nextStageOf(state, manualTrip) : null;

  // Each row reports its center Y (relative to the stages container); the
  // rail spans first-to-last center and the fill/thumb aim at the current
  // one, so the slider stays true through font scaling and label wraps.
  const [centers, setCenters] = useState<(number | undefined)[]>([]);
  const measured = STAGE_ORDER.every((_, i) => centers[i] !== undefined);
  const railTop = measured ? centers[0]! : 0;
  const railHeight = measured ? centers[STAGE_ORDER.length - 1]! - centers[0]! : 0;
  const target = measured && currentIndex >= 0 ? centers[currentIndex]! : railTop;

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

  const unlockLabel = unlocksAt
    ? `${formatDayLabel(localDateString(unlocksAt))} at ${formatTime(unlocksAt.toISOString())}`
    : null;

  return (
    <Card>
      <View style={styles.headerRow}>
        {/* Locked, this is the upcoming-trip card: its title is the quiet
            uppercase eyebrow that card always had, leaving the header to the
            share controls. Live, the big "Travel day" heading takes over. */}
        {locked ? (
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
            {title.toUpperCase()}
          </ThemedText>
        ) : (
          <ThemedText type="subtitle" style={styles.title}>
            {title}
          </ThemedText>
        )}
        {action}
      </View>

      {locked && (
        <ThemedView type="background" style={styles.lockedNote}>
          <SymbolView name={LOCK} size={14} tintColor={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.lockedText}>
            Steps unlock 24 hours before departure
            {unlockLabel ? ` — ${unlockLabel}` : ''}.
          </ThemedText>
        </ThemedView>
      )}

      {chips.length > 0 && (
        <View style={styles.chipRow}>
          {/* Fresh airport facts pop in and the row reflows around them —
           * a new delay or gate should arrive, not materialize. */}
          {chips.map((chip) => (
            <Animated.View
              key={chip.label}
              entering={ZoomIn.springify().damping(16)}
              layout={LinearTransition.springify().damping(18)}>
              <ThemedView type="background" style={styles.chip}>
                <ThemedText type="small" themeColor="textSecondary">
                  {chip.label}
                </ThemedText>
                <ThemedText
                  type="smallBold"
                  style={chip.tone === 'danger' ? { color: theme.danger } : undefined}>
                  {chip.value}
                </ThemedText>
              </ThemedView>
            </Animated.View>
          ))}
        </View>
      )}
      {!locked && factsWithData && chips.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Gate and boarding details appear here as the airport posts them.
        </ThemedText>
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
        {STAGE_ORDER.map((stage, index) => {
          const stamp = state.stamps[stage];
          const isCurrent = !locked && stage === state.stage;
          const reached = !locked && stamp !== undefined;
          const advanceable = interactive && !!onAdvance && canAdvanceTo(state, stage, manualTrip);
          const rewindable = interactive && !!onRewind && canRewindTo(state, stage, manualTrip);
          const tappable = advanceable || rewindable;
          const isNext = stage === nextStage;
          const skipped = !locked && !reached && stageIndex(stage) < currentIndex;
          // Tracked flights stamp these from live data — say so on the row,
          // so the missing tap target reads as "automatic", not "broken".
          const autoStamped = !manualTrip && !reached && !skipped && isFlightStage(stage);

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
            ? formatTime(stamp)
            : skipped
              ? 'Skipped'
              : autoStamped && !readOnly
                ? 'Fills in from live flight data'
                : null;

          const showUndo =
            isCurrent &&
            interactive &&
            !!onUndo &&
            (manualTrip || stageIndex(stage) < STAGE_ORDER.indexOf('departed'));

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
                  <Animated.View entering={FadeInDown.duration(220)} style={styles.captionRow}>
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
  title: {
    flexShrink: 1,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
    borderRadius: Spacing.two,
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
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
