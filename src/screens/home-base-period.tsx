/** Add or edit one home period: city, from and until months. Neighbours are
 * trimmed so periods never overlap, and the screen says so before saving
 * (docs/home-base.md). */
import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { CollapsingHero, useCollapsingHero } from '@/components/home-base';
import { PrimaryButton } from '@/components/primary-button';
import { SheenCard } from '@/components/sheen-card';
import { ThemedSwitch } from '@/components/themed-switch';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { countryName } from '@/services/airports';
import { usePlacePhoto } from '@/components/trip-cover';
import { localDateString } from '@/services/dates';
import { monthEnd, monthLabel, monthStart, newPeriodId, periodLabel, removePeriod, upsertPeriod } from '@/services/home-base';
import { updateHomeBase, useHomeBase, usePeriodDraft } from '@/services/home-base-store';

/** "Until August 2026" reads mid-sentence as "until August 2026". */
function lowerFirst(text: string) {
  return /^(Until|All)\b/.test(text) ? text[0]!.toLowerCase() + text.slice(1) : text;
}

function Stepper({ label, onPrev, onNext, testID }: { label: string; onPrev: () => void; onNext: () => void; testID: string }) {
  const theme = useTheme();
  const arrow = (dir: 'left' | 'right', onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dir === 'left' ? 'One month earlier' : 'One month later'}
      onPress={onPress}
      testID={`${testID}-${dir === 'left' ? 'prev' : 'next'}`}
      style={[styles.arrow, { backgroundColor: theme.backgroundSelected }]}>
      <SymbolView name={{ ios: `chevron.${dir}`, android: `chevron_${dir}`, web: `chevron_${dir}` }} size={16} tintColor={theme.heading} />
    </Pressable>
  );
  return (
    <View style={[styles.stepper, { borderColor: theme.hairline, backgroundColor: theme.field }]}>
      {arrow('left', onPrev)}
      <ThemedText type="default" themeColor="heading" testID={testID}>{label}</ThemedText>
      {arrow('right', onNext)}
    </View>
  );
}

export function HomeBasePeriod() {
  const { userId } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const state = useHomeBase(userId);
  const draft = usePeriodDraft((s) => s.draft);
  const patch = usePeriodDraft((s) => s.patch);
  const today = localDateString(new Date());
  const hero = useCollapsingHero(170);
  const photo = usePlacePhoto(draft?.city ? { city: draft.city, country: draft.country } : null);

  // Read the draft fresh on every tap: quick taps land before a re-render.
  const shift = (field: 'from' | 'until', months: number) => {
    const current = usePeriodDraft.getState().draft?.[field];
    if (!current) return;
    patch({ [field]: field === 'from' ? monthStart(current, months) : monthEnd(current, months) });
  };

  if (!draft) return <ThemedView style={styles.container} />;
  const period = { id: draft.id ?? 'draft', city: draft.city, country: draft.country, from: draft.from, until: draft.until };
  const valid = !!draft.city && !(draft.from && draft.until && draft.from > draft.until);
  const preview = valid ? upsertPeriod(state, period).changes : [];

  const save = () => {
    const saved = { ...period, id: draft.id ?? newPeriodId() };
    updateHomeBase(userId, (s) => ({ periods: upsertPeriod(s, saved).periods }));
    router.back();
  };
  const remove = () => {
    if (!draft.id) return router.back();
    Alert.alert(`Remove ${draft.city}?`, 'Trips in this period go back to Automatic.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { updateHomeBase(userId, (s) => ({ periods: removePeriod(s, draft.id!) })); router.back(); } },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <Animated.ScrollView
        onScroll={hero.onScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.scroll, { paddingTop: hero.full }]} testID="home-period-screen">
        <View style={styles.content}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>Home</ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/home-base-city', params: { target: 'draft' } })}
            testID="home-period-city"
            style={[styles.city, { borderColor: theme.hairline, backgroundColor: theme.field }]}>
            <View style={styles.grow}>
              <ThemedText type="default" themeColor={draft.city ? 'heading' : 'textSecondary'}>{draft.city || 'Choose a city'}</ThemedText>
              {!!draft.country && <ThemedText type="small" themeColor="textSecondary">{countryName(draft.country)}</ThemedText>}
            </View>
            <ThemedText type="smallBold" themeColor="tint">{draft.city ? 'Change' : 'Choose'}</ThemedText>
          </Pressable>

          <View style={styles.spaced}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>From</ThemedText>
            <View style={styles.toggle}>
              <ThemedText type="small" themeColor="heading">Since my first flight</ThemedText>
              <ThemedSwitch
                testID="home-period-from-open"
                accessibilityLabel="Since my first flight"
                value={draft.from === null}
                onValueChange={(open) => patch({ from: open ? null : monthStart(draft.until ?? today) })}
              />
            </View>
          </View>
          {draft.from !== null && (
            <Stepper
              testID="home-period-from"
              label={monthLabel(draft.from, 'start')}
              onPrev={() => shift('from', -1)}
              onNext={() => shift('from', 1)}
            />
          )}

          <View style={styles.spaced}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>Until</ThemedText>
            <View style={styles.toggle}>
              <ThemedText type="small" themeColor="heading">I still live here</ThemedText>
              <ThemedSwitch
                testID="home-period-current"
                accessibilityLabel="I still live here"
                value={draft.until === null}
                onValueChange={(still) => patch({ until: still ? null : monthEnd(today) })}
              />
            </View>
          </View>
          {draft.until !== null && (
            <Stepper
              testID="home-period-until"
              label={monthLabel(draft.until, 'end')}
              onPrev={() => shift('until', -1)}
              onNext={() => shift('until', 1)}
            />
          )}

          <SheenCard style={[styles.note, !valid && draft.city ? { borderColor: theme.danger } : preview.length ? { borderColor: theme.warning } : null]} testID="home-period-note">
            <ThemedText type="smallBold" themeColor="heading">{draft.city ? `${draft.city}: ${periodLabel(period)}` : 'Choose where you lived'}</ThemedText>
            {!valid && !!draft.city && <ThemedText type="small" themeColor="danger">The end is before the start.</ThemedText>}
            {preview.map((c) => (
              <ThemedText key={c.id} type="small" themeColor="textSecondary">
                {c.change === 'removed' ? `${c.city} (${periodLabel(c)}) is replaced.` : `${c.city} now runs ${lowerFirst(periodLabel(c))}.`}
              </ThemedText>
            ))}
            {valid && !preview.length && (
              <ThemedText type="small" themeColor="textSecondary">Trips you flew in this period start and end in {draft.city}.</ThemedText>
            )}
          </SheenCard>

          <PrimaryButton label="Save period" onPress={save} disabled={!valid} />
          {!!draft.id && (
            <Pressable accessibilityRole="button" onPress={remove} style={styles.center} testID="home-period-remove">
              <ThemedText type="link" themeColor="danger">Remove this period</ThemedText>
            </Pressable>
          )}
        </View>
      </Animated.ScrollView>
      <CollapsingHero
        hero={hero}
        place={draft.city ? { city: draft.city, country: draft.country } : null}
        photo={photo}
        eyebrow={draft.id ? 'Home period' : 'New home period'}
        title={draft.city || undefined}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: Spacing.six + BottomTabInset },
  content: { padding: Spacing.three, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  caps: { textTransform: 'uppercase', letterSpacing: 1.2 },
  city: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: 1, borderRadius: 16, padding: Spacing.three },
  grow: { flex: 1, minWidth: 0 },
  spaced: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 16, padding: Spacing.one },
  arrow: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  note: { gap: Spacing.one, padding: Spacing.three, borderWidth: 1, borderColor: 'transparent' },
  center: { alignSelf: 'center', paddingVertical: Spacing.two },
});
