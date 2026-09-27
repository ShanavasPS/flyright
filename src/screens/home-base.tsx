/** Home base: today's home under its city photo, the homes over time,
 * suggestions from the journal, and the way into each editor
 * (docs/home-base.md). */
import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { CityThumb } from '@/components/city-photo';
import { CollapsingHero, homeReason, useCollapsingHero } from '@/components/home-base';
import { PrimaryButton } from '@/components/primary-button';
import { CodeChips } from '@/components/stats-cards';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useHomeContext } from '@/hooks/use-home-base';
import { useTheme } from '@/hooks/use-theme';
import { cityAirports, countryName } from '@/services/airports';
import { usePlacePhoto } from '@/components/trip-cover';
import { localDateString } from '@/services/dates';
import { newPeriodId, periodLabel, suggestPeriods, type HomePeriod } from '@/services/home-base';
import { dismissHomePrompt, undoHomeChange, updateHomeBase, useHomeUndo, usePeriodDraft } from '@/services/home-base-store';
import { useJourneys } from '@/services/journeys';

const SUGGEST_KEY = 'suggest';

/** One home in the list, with its own city photo. */
function PeriodRow({ period, now, last, onPress }: { period: HomePeriod; now: boolean; last: boolean; onPress: () => void }) {
  const theme = useTheme();
  const photo = usePlacePhoto(period);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${period.city}${now ? ', now' : ''}, ${periodLabel(period)}. Edit`}
      onPress={onPress}
      testID={`home-period-${period.city}`}
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline }]}>
      <CityThumb place={period} photo={photo} />
      <View style={styles.grow}>
        <ThemedText type="smallBold" themeColor="heading">
          {period.city}{now ? <ThemedText type="smallBold" themeColor="tint">  Now</ThemedText> : null}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{periodLabel(period)}</ThemedText>
      </View>
      <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={theme.textSecondary} />
    </Pressable>
  );
}

/** "Home base is now Oulu · Undo", for a few seconds after the picker. */
function UndoBar({ userId }: { userId: string | null | undefined }) {
  const theme = useTheme();
  const undo = useHomeUndo((s) => s.undo);
  if (!undo) return null;
  return (
    <View style={[styles.undo, { backgroundColor: theme.backgroundSelected, borderColor: theme.hairline }]} accessibilityLiveRegion="polite" testID="home-undo">
      <ThemedText type="small" themeColor="heading" style={styles.grow}>{undo.message}</ThemedText>
      <Pressable accessibilityRole="button" hitSlop={10} onPress={() => undoHomeChange(userId)} testID="home-undo-button">
        <ThemedText type="smallBold" themeColor="tint">Undo</ThemedText>
      </Pressable>
    </View>
  );
}

export function HomeBase() {
  const { userId } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { data: journeys } = useJourneys(userId);
  const rows = useMemo(() => journeys ?? [], [journeys]);
  const home = useHomeContext(userId, rows);
  const { state, current } = home;
  const today = localDateString(new Date());
  const suggestions = useMemo(() => suggestPeriods(rows, new Date()), [rows]);
  const showSuggestions = state.loaded && !state.periods.length && suggestions.length >= 2 && !state.dismissed.includes(SUGGEST_KEY);
  const [unticked, setUnticked] = useState<Record<number, boolean>>({});
  const hero = useCollapsingHero(290);
  const setDraft = usePeriodDraft((s) => s.setDraft);
  const chosenCount = suggestions.length - Object.values(unticked).filter(Boolean).length;

  const openPeriod = (period: HomePeriod | null) => {
    setDraft(period
      ? { id: period.id, city: period.city, country: period.country, from: period.from, until: period.until }
      : { id: null, city: '', country: '', from: `${today.slice(0, 7)}-01`, until: null });
    router.push({ pathname: '/home-base-period', params: period ? { id: period.id } : {} });
  };

  const confirmSuggestions = () => {
    const chosen = suggestions.filter((_, i) => !unticked[i]);
    updateHomeBase(userId, () => ({
      periods: chosen.map((s) => ({ id: newPeriodId(), city: s.city, country: s.country, from: s.from, until: s.until })),
    }));
  };

  const useAutomatic = () => {
    Alert.alert('Use automatic?', 'Your homes over time are removed, and FlyRight counts from the city you take off from most.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Use automatic', style: 'destructive', onPress: () => updateHomeBase(userId, () => ({ periods: [] })) },
    ]);
  };

  const periods = [...state.periods].reverse();
  const place = current ? { city: current.city, country: current.country } : null;
  const photo = usePlacePhoto(place);
  const airports = current ? cityAirports(current.city, current.country) : [];
  const badge = current ? (current.source === 'auto' ? 'Auto' : 'Set by you') : '';

  return (
    <ThemedView style={styles.container}>
      <Animated.ScrollView
        onScroll={hero.onScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.scroll, { paddingTop: hero.full }]} testID="home-base-screen">
        <View style={styles.content}>
          <UndoBar userId={userId} />
          {current && (
            <View style={styles.title}>
              {airports.length > 0 && <CodeChips codes={airports} strong={airports} />}
              <ThemedText type="small" themeColor="textSecondary">
                {current.source === 'set' && current.period ? `${periodLabel(current.period)}. ` : ''}{homeReason(current)}
              </ThemedText>
            </View>
          )}
          <View style={styles.buttons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change city"
              onPress={() => router.push({ pathname: '/home-base-city', params: { target: 'current' } })}
              testID="home-base-change-current"
              style={[styles.button, { borderColor: theme.hairline, backgroundColor: theme.backgroundElement }]}>
              <SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} size={16} tintColor={theme.tint} />
              <ThemedText type="smallBold" themeColor="tint">Change city</ThemedText>
            </Pressable>
            {place && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change photo"
                onPress={() => router.push({ pathname: '/home-photo', params: { city: place.city, country: place.country } })}
                testID="home-base-change-photo"
                style={[styles.button, { borderColor: theme.hairline, backgroundColor: theme.backgroundElement }]}>
                <SymbolView name={{ ios: 'photo', android: 'image', web: 'image' }} size={16} tintColor={theme.tint} />
                <ThemedText type="smallBold" themeColor="tint">Change photo</ThemedText>
              </Pressable>
            )}
          </View>
          {showSuggestions && (
            <SheenCard style={styles.card} testID="home-suggestions">
              <ThemedText type="default" themeColor="heading">You seem to have lived in {suggestions.length} places</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Your take-offs cluster in these cities over time. Confirm the ones that were home and each trip counts from the home you had then.
              </ThemedText>
              {suggestions.map((s, i) => {
                const on = !unticked[i];
                return (
                  <Pressable
                    key={`${s.city}-${i}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${s.city}, ${periodLabel(s)}, ${s.departures} take-offs`}
                    onPress={() => setUnticked((u) => ({ ...u, [i]: on }))}
                    style={[styles.suggestion, { borderColor: on ? theme.tint : theme.hairline }]}>
                    <SymbolView
                      name={on ? { ios: 'checkmark.square.fill', android: 'check_box', web: 'check_box' } : { ios: 'square', android: 'check_box_outline_blank', web: 'check_box_outline_blank' }}
                      size={22}
                      tintColor={on ? theme.tint : theme.textSecondary}
                    />
                    <View style={styles.grow}>
                      <ThemedText type="smallBold" themeColor="heading">{s.city}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">{periodLabel(s)}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">{s.departures} take-offs from {s.city}</ThemedText>
                    </View>
                  </Pressable>
                );
              })}
              <PrimaryButton
                label={chosenCount === 0 ? 'Keep it automatic' : `Confirm ${chosenCount} ${chosenCount === 1 ? 'home' : 'homes'}`}
                onPress={chosenCount === 0 ? () => dismissHomePrompt(userId, SUGGEST_KEY) : confirmSuggestions}
              />
              <Pressable accessibilityRole="button" onPress={() => dismissHomePrompt(userId, SUGGEST_KEY)} style={styles.center}>
                <ThemedText type="link" themeColor="tint">Not now</ThemedText>
              </Pressable>
            </SheenCard>
          )}

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>Your homes over time</ThemedText>
          <SheenCard style={styles.list}>
            {periods.length === 0 && (
              <View style={styles.row}>
                <ThemedText type="small" themeColor="textSecondary">
                  No periods yet. Automatic counts every trip from the city you take off from most. Add a period for a place you lived before.
                </ThemedText>
              </View>
            )}
            {periods.map((p, i) => (
              <PeriodRow
                key={p.id}
                period={p}
                now={(p.from === null || p.from <= today) && (p.until === null || today <= p.until)}
                last={i === periods.length - 1}
                onPress={() => openPeriod(p)}
              />
            ))}
          </SheenCard>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a period"
            onPress={() => openPeriod(null)}
            testID="home-add-period"
            style={[styles.add, { borderColor: theme.hairline, backgroundColor: theme.backgroundElement }]}>
            <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={16} tintColor={theme.tint} />
            <ThemedText type="smallBold" themeColor="tint">Add a period</ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary">
            Any time a period doesn&apos;t cover uses Automatic. Your home base is only for you: friends never see it.
          </ThemedText>
          {state.periods.length > 0 && (
            <Pressable accessibilityRole="button" onPress={useAutomatic} style={styles.center} testID="home-use-automatic">
              <ThemedText type="link" themeColor="danger">Use automatic instead</ThemedText>
            </Pressable>
          )}
        </View>
      </Animated.ScrollView>
      <CollapsingHero
        hero={hero}
        place={place}
        photo={photo}
        eyebrow="Home base"
        title={current?.city ?? 'Not set yet'}
        subtitle={current ? `${current.country ? `${countryName(current.country)} · ` : ''}${badge}` : 'Add a flight and FlyRight works it out, or choose one.'}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: Spacing.six + BottomTabInset },
  content: { padding: Spacing.three, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  button: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, minHeight: 44, borderRadius: 14, borderWidth: 1 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: 1, borderRadius: 14, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  title: { gap: Spacing.one },
  card: { gap: Spacing.two, padding: Spacing.four },
  list: { padding: 0, paddingVertical: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  grow: { flex: 1, minWidth: 0 },
  caps: { textTransform: 'uppercase', letterSpacing: 1.2 },
  suggestion: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center', borderWidth: 1, borderRadius: 16, padding: Spacing.three },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, minHeight: 48, borderRadius: 16, borderWidth: 1 },
  center: { alignSelf: 'center', paddingVertical: Spacing.two },
});
