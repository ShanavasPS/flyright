import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatTime } from '@/services/dates';
import {
  STAGE_LABELS,
  STAGE_ORDER,
  STAGE_PROMPTS,
  TRAVELER_STAGES,
  canAdvanceTo,
  stageIndex,
  type FlightFacts,
  type TravelDayState,
  type TravelJourney,
  type TravelStage,
} from '@/services/travel-day';

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

/** The travel-day walk: flight facts up top, then the eight stages — stamped
 * ones with their time, the traveler's next steps tappable, flight-driven
 * rows never tappable. `readOnly` renders the same view for followers. */
export function TravelDayTimeline({
  journey,
  state,
  facts,
  readOnly = false,
  onAdvance,
  onUndo,
  action,
}: {
  journey: TravelJourney;
  state: TravelDayState;
  facts: FlightFacts;
  readOnly?: boolean;
  onAdvance?: (stage: TravelStage) => void;
  onUndo?: () => void;
  /** Optional header-row control — the traveler's share pill. */
  action?: React.ReactNode;
}) {
  const theme = useTheme();
  const currentIndex = stageIndex(state.stage);
  const factsWithData = journey.source === 'lookup';

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

  // The one tap that's usually next: the first un-stamped traveler stage.
  const nextStage = TRAVELER_STAGES.find((s) => canAdvanceTo(state, s));

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
        {STAGE_ORDER.map((stage) => {
          const stamp = state.stamps[stage];
          const isCurrent = stage === state.stage;
          const reached = stamp !== undefined;
          const tappable = !readOnly && !!onAdvance && canAdvanceTo(state, stage);
          const isNext = stage === nextStage;
          const skipped = !reached && stageIndex(stage) < currentIndex;

          const color = isCurrent
            ? theme.tint
            : reached
              ? theme.heading
              : theme.textSecondary;

          // The next step reads as its action ("I'm on board"), the rest as
          // plain labels. The accessible name must be this same string —
          // announcing text that differs from what's shown fails label-in-name.
          const rowLabel = tappable && isNext ? STAGE_PROMPTS[stage as never] : STAGE_LABELS[stage];

          const rowContent = (
            <>
              <SymbolView
                name={STAGE_ICONS[stage]}
                size={18}
                tintColor={skipped ? theme.backgroundSelected : color}
              />
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
              {/* Every tappable stage wears an empty check circle — without
                  it, only the highlighted next step reads as actionable. */}
              {tappable && (
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
              {isCurrent &&
                !readOnly &&
                !!onUndo &&
                stageIndex(stage) < STAGE_ORDER.indexOf('departed') && (
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
              <View key={stage} style={styles.stageRow}>
                {rowContent}
              </View>
            );
          }
          return (
            <Pressable
              key={stage}
              accessibilityRole="button"
              accessibilityLabel={rowLabel}
              onPress={() => onAdvance!(stage)}
              style={({ pressed }) => [styles.stageRow, pressed && styles.pressed]}>
              {rowContent}
            </Pressable>
          );
        })}
      </View>
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
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 28,
  },
  stageLabel: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
