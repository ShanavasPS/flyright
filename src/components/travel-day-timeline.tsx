import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatTime } from '@/services/dates';
import {
  FLIGHT_STAGES,
  STAGE_LABELS,
  STAGE_ORDER,
  STAGE_PROMPTS,
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

const STAGE_ICONS: Record<TravelStage, SymbolViewProps['name']> = {
  at_airport: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  checked_in: { ios: 'checkmark.seal', android: 'check_circle', web: 'check_circle' },
  bag_dropped: { ios: 'suitcase', android: 'luggage', web: 'luggage' },
  security: { ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' },
  immigration: { ios: 'person.text.rectangle', android: 'badge', web: 'badge' },
  boarded: { ios: 'ticket', android: 'confirmation_number', web: 'confirmation_number' },
  departed: { ios: 'airplane.departure', android: 'flight_takeoff', web: 'flight_takeoff' },
  landed: { ios: 'airplane.arrival', android: 'flight_land', web: 'flight_land' },
};

/** Width of the icon column; the rail, its fill, and the sliding thumb are
 * all centered on it. Matches the rows' minHeight so the thumb circle covers
 * exactly one stop. */
const ICON_COLUMN = 28;
const RAIL_WIDTH = 3;
const SPRING = { damping: 18, stiffness: 170 } as const;

/** The travel-day walk as a vertical slider: flight facts up top, then the
 * eight stages strung on a rail. A tinted fill and a thumb spring to the
 * current stage; tapping ahead advances, tapping an earlier stamped stage
 * slides back to it. Flight-driven rows are never tappable, and `readOnly`
 * renders the same view for followers. */
export function TravelDayTimeline({
  journey,
  state,
  facts,
  readOnly = false,
  onAdvance,
  onRewind,
  onUndo,
  action,
}: {
  journey: TravelJourney;
  state: TravelDayState;
  facts: FlightFacts;
  readOnly?: boolean;
  onAdvance?: (stage: TravelStage) => void;
  /** Slide back to an earlier stamped stage (drops the stamps after it). */
  onRewind?: (stage: TravelStage) => void;
  onUndo?: () => void;
  /** Optional header-row control — the traveler's share pill. */
  action?: React.ReactNode;
}) {
  const theme = useTheme();
  const currentIndex = stageIndex(state.stage);
  const factsWithData = journey.source === 'lookup';
  // Journal trips have no status feed, so the traveler stamps departed/landed
  // too; tracked flights keep those data-only (and say so, see the caption).
  const manualTrip = journey.source === 'manual';

  const chips: { label: string; value: string; tone?: 'danger' }[] = [];
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

  // The one tap that's usually next: the first un-stamped tappable stage.
  const nextStage = STAGE_ORDER.find((s) => canAdvanceTo(state, s, manualTrip));

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
    const y = target - ICON_COLUMN / 2;
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

  return (
    <Card>
      <View style={styles.headerRow}>
        <ThemedText type="subtitle">Travel day</ThemedText>
        {action}
      </View>

      {chips.length > 0 && (
        <View style={styles.chipRow}>
          {chips.map((chip) => (
            <ThemedView key={chip.label} type="background" style={styles.chip}>
              <ThemedText type="small" themeColor="textSecondary">
                {chip.label}
              </ThemedText>
              <ThemedText
                type="smallBold"
                style={chip.tone === 'danger' ? { color: theme.danger } : undefined}>
                {chip.value}
              </ThemedText>
            </ThemedView>
          ))}
        </View>
      )}
      {factsWithData && chips.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Gate and boarding details appear here as the airport posts them.
        </ThemedText>
      )}

      <View style={styles.stages}>
        {measured && (
          <>
            <View
              style={[
                styles.rail,
                { top: railTop, height: railHeight, backgroundColor: theme.backgroundSelected },
              ]}
            />
            <Animated.View
              style={[styles.railFill, { top: railTop, backgroundColor: theme.tint }, fillStyle]}
            />
            {currentIndex >= 0 && (
              <Animated.View
                pointerEvents="none"
                style={[styles.thumb, { backgroundColor: theme.tint }, thumbStyle]}
              />
            )}
          </>
        )}
        {STAGE_ORDER.map((stage, index) => {
          const stamp = state.stamps[stage];
          const isCurrent = stage === state.stage;
          const reached = stamp !== undefined;
          const advanceable = !readOnly && !!onAdvance && canAdvanceTo(state, stage, manualTrip);
          const rewindable = !readOnly && !!onRewind && canRewindTo(state, stage, manualTrip);
          const tappable = advanceable || rewindable;
          const isNext = stage === nextStage;
          const skipped = !reached && stageIndex(stage) < currentIndex;
          // Tracked flights stamp these from live data — mark them so the
          // missing tap circle reads as "automatic", not "broken".
          const flightStamped =
            !manualTrip && !reached && !readOnly && !!onAdvance && isFlightStage(stage);

          const color = isCurrent
            ? theme.tint
            : reached
              ? theme.heading
              : theme.textSecondary;

          // The next step reads as its action ("I'm on board"), the rest as
          // plain labels. The accessible name must contain this same string —
          // announcing text that differs from what's shown fails label-in-name.
          const rowLabel = advanceable && isNext ? STAGE_PROMPTS[stage] : STAGE_LABELS[stage];

          // The current row's circle is transparent — the sliding thumb behind
          // it is its fill, so the highlight visibly travels between rows.
          // Everyone else masks the rail with an opaque circle.
          const circleColor = isCurrent
            ? 'transparent'
            : reached
              ? theme.backgroundSelected
              : theme.backgroundElement;

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
              <View style={[styles.iconCircle, { backgroundColor: circleColor }]}>
                <SymbolView
                  name={STAGE_ICONS[stage]}
                  size={18}
                  tintColor={
                    isCurrent ? '#FFFFFF' : skipped ? theme.backgroundSelected : color
                  }
                />
              </View>
              <ThemedText
                type={isCurrent ? 'smallBold' : 'small'}
                style={[styles.stageLabel, { color: skipped ? theme.textSecondary : color }]}>
                {rowLabel}
              </ThemedText>
              {reached && (
                <Animated.View entering={FadeInDown.duration(220)}>
                  <ThemedText type="small" themeColor={isCurrent ? undefined : 'textSecondary'}>
                    {formatTime(stamp)}
                  </ThemedText>
                </Animated.View>
              )}
              {/* Every advanceable stage wears an empty check circle — without
                  it, only the highlighted next step reads as actionable. */}
              {advanceable && (
                <SymbolView
                  name={{
                    ios: 'circle',
                    android: 'radio_button_unchecked',
                    web: 'radio_button_unchecked',
                  }}
                  size={20}
                  tintColor={isNext ? theme.tint : theme.textSecondary}
                />
              )}
              {/* Data-stamped rows trade the tap circle for a live-data mark,
                  paired with the caption under the list. */}
              {flightStamped && (
                <SymbolView
                  name={{
                    ios: 'antenna.radiowaves.left.and.right',
                    android: 'sensors',
                    web: 'sensors',
                  }}
                  size={16}
                  tintColor={theme.textSecondary}
                />
              )}
              {isCurrent &&
                !readOnly &&
                !!onUndo &&
                (manualTrip || stageIndex(stage) < STAGE_ORDER.indexOf('departed')) && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Undo last step"
                    hitSlop={Spacing.two}
                    onPress={onUndo}>
                    <ThemedText type="small" style={{ color: theme.tint }}>
                      Undo
                    </ThemedText>
                  </Pressable>
                )}
            </>
          );

          // Tappable rows are Pressables; the rest are plain Views — an iOS
          // Pressable flattens its children into one accessibility label,
          // which would swallow the nested Undo button.
          if (!tappable) {
            return (
              <View key={stage} style={styles.stageRow} onLayout={onRowLayout}>
                {rowContent}
              </View>
            );
          }
          return (
            <Pressable
              key={stage}
              accessibilityRole="button"
              accessibilityLabel={advanceable ? rowLabel : `Go back to ${rowLabel}`}
              onLayout={onRowLayout}
              onPress={() => (advanceable ? onAdvance!(stage) : onRewind!(stage))}
              style={({ pressed }) => [styles.stageRow, pressed && styles.pressed]}>
              {rowContent}
            </Pressable>
          );
        })}
      </View>

      {/* Why the last two rows have no tap circle — shown only while they're
          still pending on a tracked flight, and only to the traveler. */}
      {!readOnly && !!onAdvance && !manualTrip && !state.stamps.landed && (
        <ThemedText type="small" themeColor="textSecondary">
          Departed and Landed fill in automatically from live flight data.
        </ThemedText>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
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
    gap: Spacing.two,
  },
  rail: {
    position: 'absolute',
    left: (ICON_COLUMN - RAIL_WIDTH) / 2,
    width: RAIL_WIDTH,
    borderRadius: RAIL_WIDTH / 2,
  },
  railFill: {
    position: 'absolute',
    left: (ICON_COLUMN - RAIL_WIDTH) / 2,
    width: RAIL_WIDTH,
    borderRadius: RAIL_WIDTH / 2,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: ICON_COLUMN,
    height: ICON_COLUMN,
    borderRadius: ICON_COLUMN / 2,
  },
  iconCircle: {
    width: ICON_COLUMN,
    height: ICON_COLUMN,
    borderRadius: ICON_COLUMN / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: ICON_COLUMN,
  },
  stageLabel: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
