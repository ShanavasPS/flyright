import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

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

  useEffect(() => {
    if (!width) return;
    scroll.current?.scrollTo({ x: Math.max(0, (focusAt - 1) * STEP), animated: false });
  }, [focusAt, width]);

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
          const isNext = stage === next;
          const skipped = !reached && stageIndex(stage) < currentIndex;
          const advanceable = canAdvanceTo(state, stage, rules);
          const rewindable = canRewindTo(state, stage, rules);
          const auto = !manualTrip && isFlightStage(stage) && !reached && !advanceable;
          const lineIn = i > 0 && (reached || isCurrent) ? theme.success : theme.backgroundSelected;
          const lineOut =
            i < plan.length - 1 && reached && stageIndex(plan[i + 1]) <= currentIndex ? theme.success : theme.backgroundSelected;
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
              <View style={styles.track}>
                <View style={[styles.line, { backgroundColor: i === 0 ? 'transparent' : lineIn }]} />
                <View
                  style={[
                    styles.dot,
                    reached
                      ? { backgroundColor: theme.success, borderColor: theme.success }
                      : {
                          borderColor: isNext ? theme.tint : theme.backgroundSelected,
                          borderStyle: skipped ? 'dashed' : 'solid',
                        },
                  ]}>
                  <SymbolView
                    name={STAGE_ICONS[stage]}
                    size={13}
                    tintColor={reached ? '#FFFFFF' : isNext ? theme.tint : theme.textSecondary}
                  />
                  {reached && (
                    <View style={[styles.tick, { backgroundColor: theme.success, borderColor: theme.backgroundElement }]}>
                      <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={7} weight="heavy" tintColor="#FFFFFF" />
                    </View>
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
                </View>
                <View style={[styles.line, { backgroundColor: i === plan.length - 1 ? 'transparent' : lineOut }]} />
              </View>
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
