import { useAuth } from '@clerk/expo';
import { Stack, useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { DataErrorState, LoadingState } from '@/components/data-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { STAGE_ICONS, TravelDayTimeline } from '@/components/travel-day-timeline';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useStepPlans } from '@/hooks/use-step-plans';
import { useTheme } from '@/hooks/use-theme';
import { HeaderButton } from '@/screens/journey-note';
import { tapLight } from '@/services/haptics';
import { homeCheck } from '@/services/home-base';
import { useHomeBase } from '@/services/home-base-store';
import { useJourneys, type JourneyRow } from '@/services/journeys';
import {
  FLIGHT_STAGES,
  OPTIONAL_STAGES,
  STAGE_LABELS,
  STAGE_ORDER,
  chosenPlan,
  stageRules,
  travelWindow,
  type StagePlan,
  type TravelDayState,
  type TravelStage,
} from '@/services/travel-day';
import { factsFor, reconcileTravelDay } from '@/services/travel-day-lifecycle';
import { itineraryOf, stagePlans } from '@/services/travel-day-plan';
import { advanceStage, rewindStage, setStepPlan, undoStage, useTravelDayStates } from '@/services/travel-day-store';

/** The editor names the two passport desks apart — "Through immigration"
 * twice in the add list would not say which. */
const EDITOR_LABELS: Partial<Record<TravelStage, string>> = {
  immigration: 'Immigration on departure',
  arrival_immigration: 'Immigration on arrival',
};
const editorLabel = (stage: TravelStage) => EDITOR_LABELS[stage] ?? STAGE_LABELS[stage];

const isFlightStage = (stage: TravelStage) => (FLIGHT_STAGES as readonly string[]).includes(stage);
const samePlan = (a: StagePlan, b: StagePlan) => a.length === b.length && a.every((s, i) => s === b[i]);

/** Trip progress, full screen: every leg of the itinerary with all of its
 * steps, from leaving home (or the hotel) to arriving at the hotel (or
 * home). Steps are tapped done here as on the trip page. Edit lets the
 * traveller take steps out and add standard ones back; the suggestion comes
 * from the home base, the connections and the destination, and "Use the
 * suggested steps" returns to it. Changes are a draft until Save; leaving
 * with unsaved changes asks first. Followers see the steps chosen here. */
export function TripProgress({ journeyId }: { journeyId: string }) {
  const { userId } = useAuth();
  const { data: journal, error } = useJourneys(userId);
  const stateOf = useTravelDayStates();
  const planOf = useStepPlans(journal, stateOf);
  const home = useHomeBase(userId);
  const suggestedOf = useMemo(() => {
    const rows = journal ?? [];
    return stagePlans(rows, homeCheck(home, rows));
  }, [journal, home]);
  const now = useNow(60_000);
  const navigation = useNavigation();
  const [editing, setEditing] = useState(false);
  // Unsaved edits per leg: the new list, or null for "back to the suggested
  // steps". A leg absent here is untouched.
  const [drafts, setDrafts] = useState<Record<string, StagePlan | null>>({});
  const dirty = Object.keys(drafts).length > 0;

  const stopEditing = () => {
    setDrafts({});
    setEditing(false);
  };
  const save = async () => {
    for (const [legId, plan] of Object.entries(drafts)) await setStepPlan(legId, plan);
    void reconcileTravelDay();
    stopEditing();
  };
  const cancel = () => {
    if (!dirty) return stopEditing();
    Alert.alert('Discard your changes?', 'The steps stay as they were.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: stopEditing },
    ]);
  };

  // Leaving with unsaved edits — the back button, or a swipe that got
  // through — asks first, the way every editor does.
  useEffect(() => {
    if (!dirty) return;
    return navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      Alert.alert('Save your changes?', 'You changed the steps of this trip.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        {
          text: 'Save',
          onPress: () => {
            void save().then(() => navigation.dispatch(e.data.action));
          },
        },
      ]);
    });
    // save reads the drafts this effect was set up with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, drafts, navigation]);

  const header = (
    <Stack.Screen
      options={{
        gestureEnabled: !dirty,
        headerLeft: editing ? () => <HeaderButton label="Cancel" onPress={cancel} /> : undefined,
        headerRight: () =>
          editing ? (
            <HeaderButton label="Save" bold disabled={!dirty} onPress={() => void save()} />
          ) : (
            <HeaderButton
              label="Edit"
              onPress={() => {
                tapLight();
                setEditing(true);
              }}
            />
          ),
      }}
    />
  );

  if (error) return <DataErrorState error={error} />;
  if (!journal) return <LoadingState />;
  const row = journal.find((j) => j.id === journeyId);
  if (!row) return null;
  const legs = itineraryOf(row, journal);

  return (
    <ThemedView style={styles.container}>
      {header}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}>
        {editing && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
            Take out the steps you won&apos;t need and add the ones you will. The people following you see the
            same steps. Take-off and landing always stay.
          </ThemedText>
        )}
        {legs.map((leg) => {
          const state = stateOf(leg.id);
          const plan = planOf(leg.id);
          const draft = drafts[leg.id];
          const suggested = suggestedOf(leg.id);
          return editing ? (
            <StepEditor
              key={leg.id}
              leg={leg}
              state={state}
              plan={draft === undefined ? plan : chosenPlan({ plan: draft ?? undefined, stamps: state.stamps }, suggested)}
              customised={draft === undefined ? !!state.plan : draft !== null}
              suggested={suggested}
              onChange={(next) => setDrafts((d) => ({ ...d, [leg.id]: next }))}
            />
          ) : (
            <LegProgress key={leg.id} leg={leg} state={state} plan={plan} now={now} />
          );
        })}
      </ScrollView>
    </ThemedView>
  );
}

function legTitle(leg: JourneyRow): string {
  return leg.number ? `${leg.fromCode} → ${leg.toCode} · ${leg.number}` : `${leg.fromCode} → ${leg.toCode}`;
}

/** One leg's steps as the vertical timeline, tappable as on the trip page;
 * a leg whose day has not come yet shows them as a preview, and one whose
 * day is over as it was left. */
function LegProgress({ leg, state, plan, now }: { leg: JourneyRow; state: TravelDayState; plan: StagePlan; now: Date }) {
  const facts = factsFor(leg);
  const rules = stageRules(leg, state, facts, now, plan);
  const travel = travelWindow(leg, state, now, plan);
  return (
    <TravelDayTimeline
      journey={leg}
      state={state}
      facts={facts}
      plan={plan}
      title={legTitle(leg)}
      locked={travel.phase === 'before'}
      readOnly={travel.phase === 'ended'}
      unlocksAt={travel.startsAt}
      onAdvance={(stage) => {
        void advanceStage(leg.id, stage, rules).then(() => reconcileTravelDay());
      }}
      onRewind={(stage) => {
        void rewindStage(leg.id, stage, rules).then(() => reconcileTravelDay());
      }}
      onUndo={() => {
        void undoStage(leg.id, rules).then(() => reconcileTravelDay());
      }}
    />
  );
}

/** One leg's steps with a remove button on each optional one, the standard
 * steps it lacks to add, and the way back to the suggestion. A step already
 * done stays — taking it out would hide a stamp followers have seen. */
function StepEditor({
  leg,
  state,
  plan,
  customised,
  suggested,
  onChange,
}: {
  leg: JourneyRow;
  state: TravelDayState;
  plan: StagePlan;
  /** The list differs from the suggestion (saved or in the draft). */
  customised: boolean;
  suggested: StagePlan;
  onChange: (plan: StagePlan | null) => void;
}) {
  const theme = useTheme();
  const missing = OPTIONAL_STAGES.filter((s) => !plan.includes(s));
  const save = (next: TravelStage[]) => {
    const ordered = STAGE_ORDER.filter((s) => next.includes(s));
    tapLight();
    onChange(samePlan(ordered, suggested) ? null : ordered);
  };
  return (
    <Card testID={`step-editor-${leg.id}`}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
        {legTitle(leg).toUpperCase()}
      </ThemedText>
      <View>
        {plan.map((stage) => {
          const done = state.stamps[stage] !== undefined;
          const removable = !isFlightStage(stage) && !done;
          return (
            <View key={stage} style={[styles.stepRow, { borderBottomColor: theme.hairline }]}>
              <View style={[styles.stepIcon, { backgroundColor: `${theme.tint}1F` }]}>
                <SymbolView name={STAGE_ICONS[stage]} size={16} tintColor={theme.tint} />
              </View>
              <View style={styles.stepText}>
                <ThemedText style={styles.stepLabel}>{editorLabel(stage)}</ThemedText>
                {(isFlightStage(stage) || done) && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {done ? 'Done' : 'Always part of the flight'}
                  </ThemedText>
                )}
              </View>
              {removable && (
                <Pressable
                  testID={`step-remove-${stage}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${editorLabel(stage)}`}
                  hitSlop={Spacing.two}
                  onPress={() => save(plan.filter((s) => s !== stage))}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <SymbolView
                    name={{ ios: 'minus.circle.fill', android: 'remove_circle', web: 'remove_circle' }}
                    size={22}
                    tintColor={theme.danger}
                  />
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
      {missing.length > 0 && (
        <>
          <ThemedText type="smallBold" themeColor="textSecondary" style={[styles.eyebrow, styles.addHeading]}>
            ADD A STEP
          </ThemedText>
          <View style={styles.chips}>
            {missing.map((stage) => (
              <Pressable
                key={stage}
                testID={`step-add-${stage}`}
                accessibilityRole="button"
                accessibilityLabel={`Add ${editorLabel(stage)}`}
                onPress={() => save([...plan, stage])}
                style={({ pressed }) => [
                  styles.chip,
                  { borderColor: theme.hairline, backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}>
                <SymbolView name={STAGE_ICONS[stage]} size={13} tintColor={theme.tint} />
                <ThemedText type="smallBold">{editorLabel(stage)}</ThemedText>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {customised && (
        <Pressable
          testID={`step-reset-${leg.id}`}
          accessibilityRole="button"
          onPress={() => {
            tapLight();
            onChange(null);
          }}
          style={({ pressed }) => [styles.reset, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            Use the suggested steps
          </ThemedText>
        </Pressable>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  intro: {
    marginHorizontal: Spacing.one,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stepIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    gap: 2,
  },
  stepLabel: {
    fontSize: 16,
    lineHeight: 21,
  },
  addHeading: {
    marginTop: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: 18,
    borderWidth: 1,
  },
  reset: {
    alignSelf: 'flex-start',
    minHeight: 32,
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  pressed: {
    opacity: 0.6,
  },
});
