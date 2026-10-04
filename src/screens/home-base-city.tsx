/** Choose a home base city: Automatic, a city from the journal, or any
 * city or airport by search. One tap chooses: `target=current` changes
 * today's home (with Undo on the Home base screen); `target=draft` fills the
 * period being edited, which has its own Save (docs/home-base.md). */
import { useAuth } from '@clerk/expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { CityThumb } from '@/components/city-photo';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { flagArt } from '@/components/trip-group-mark';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useHomeContext } from '@/hooks/use-home-base';
import { useTheme } from '@/hooks/use-theme';
import { cityAirports, countryName, searchAirports } from '@/services/airports';
import { useCityPhoto } from '@/services/city-photo';
import { localDateString } from '@/services/dates';
import { airportPlace, autoHome, placeKey, samePlace, setCurrentHome, type HomePlace } from '@/services/home-base';
import { changeHomeWithUndo, usePeriodDraft } from '@/services/home-base-store';
import { useJourneys } from '@/services/journeys';

type Option = HomePlace & { key: string; detail: string };

function FlagSquare({ country }: { country: string }) {
  const theme = useTheme();
  const art = flagArt(country);
  return (
    <View style={[styles.square, { backgroundColor: theme.backgroundSelected }]}>
      {!!art && <SvgXml xml={art} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />}
    </View>
  );
}

/** A city from the journal: worth its photo (six at most). */
function PhotoSquare({ place }: { place: HomePlace }) {
  const photo = useCityPhoto(place);
  return <CityThumb place={place} photo={photo} size={44} />;
}

export function HomeBaseCity() {
  const { userId } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { target } = useLocalSearchParams<{ target?: string }>();
  const forDraft = target === 'draft';
  const { data: journeys } = useJourneys(userId);
  const rows = useMemo(() => journeys ?? [], [journeys]);
  const { state, current } = useHomeContext(userId, rows);
  const draft = usePeriodDraft((s) => s.draft);
  const patchDraft = usePeriodDraft((s) => s.patch);
  const [query, setQuery] = useState('');
  const chosen: HomePlace | 'auto' | null = forDraft
    ? (draft?.city ? { city: draft.city, country: draft.country } : null)
    : state.periods.length ? (current ? { city: current.city, country: current.country } : null) : 'auto';

  const fromFlights: Option[] = useMemo(() => {
    const counts = new Map<string, Option & { count: number }>();
    for (const row of rows) {
      if (row.deletedAt || row.mode !== 'flight') continue;
      const place = airportPlace(row.fromCode, row.fromCountry);
      const entry = counts.get(placeKey(place)) ?? { ...place, key: placeKey(place), detail: '', count: 0 };
      entry.count += 1;
      counts.set(placeKey(place), entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 6)
      .map((o) => ({ ...o, detail: `${o.count} take-off${o.count === 1 ? '' : 's'}` }));
  }, [rows]);

  const searched: Option[] = useMemo(() => {
    const seen = new Set<string>();
    const out: Option[] = [];
    for (const airport of searchAirports(query, 12)) {
      const place = airportPlace(airport.iata);
      if (seen.has(placeKey(place))) continue;
      seen.add(placeKey(place));
      out.push({ ...place, key: placeKey(place), detail: cityAirports(place.city, place.country).join(' · ') || airport.iata });
    }
    return out;
  }, [query]);

  const searching = !!query.trim();
  const options = searching ? searched : fromFlights;
  // The same city the Home base card shows, not merely the most take-offs.
  const automatic = useMemo(() => autoHome(rows), [rows]);

  const pick = (place: HomePlace | 'auto') => {
    if (forDraft) {
      if (place !== 'auto') patchDraft({ city: place.city, country: place.country });
    } else if (place === 'auto') {
      if (state.periods.length) changeHomeWithUndo(userId, 'Home base is automatic again', () => []);
    } else if (!(chosen && chosen !== 'auto' && samePlace(chosen, place))) {
      const today = localDateString(new Date());
      changeHomeWithUndo(userId, `Home base is now ${place.city}`, (s) => setCurrentHome(s, place, today));
    }
    router.back();
  };

  const chevron = <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={theme.textSecondary} />;
  const currentTag = <ThemedText type="smallBold" themeColor="tint">Current</ThemedText>;

  const row = (o: Option, i: number) => {
    const isCurrent = chosen !== null && chosen !== 'auto' && samePlace(chosen, o);
    return (
      <Pressable
        key={o.key}
        accessibilityRole="button"
        accessibilityLabel={`${o.city}${o.country ? `, ${countryName(o.country)}` : ''}, ${o.detail}${isCurrent ? ', current' : ''}`}
        onPress={() => pick({ city: o.city, country: o.country })}
        testID={`home-city-${o.city}`}
        style={({ pressed }) => [
          styles.option,
          i < options.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline },
          pressed && { backgroundColor: theme.backgroundSelected },
        ]}>
        {searching ? <FlagSquare country={o.country} /> : <PhotoSquare place={o} />}
        <View style={styles.grow}>
          <ThemedText type="smallBold" themeColor="heading" numberOfLines={1}>
            {o.city} <ThemedText type="small" themeColor="textSecondary">{o.country ? countryName(o.country) : ''}</ThemedText>
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{o.detail}</ThemedText>
        </View>
        {isCurrent ? currentTag : chevron}
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          {forDraft
            ? 'Where you lived in this period. Every airport in the city counts as home.'
            : 'Where your trips start and end. Travel stats, Places and your trips count from here. A home base is a city: every airport in it counts as home.'}
        </ThemedText>
        {!forDraft && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Automatic: the city you fly from and spend time in${chosen === 'auto' ? ', current' : ''}`}
            onPress={() => pick('auto')}
            testID="home-city-automatic"
            style={({ pressed }) => [styles.auto, { borderColor: chosen === 'auto' ? theme.tint : theme.hairline, backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement }]}>
            <View style={[styles.square, styles.center, { backgroundColor: theme.backgroundSelected }]}>
              <SymbolView name={{ ios: 'wand.and.stars', android: 'auto_awesome', web: 'auto_awesome' }} size={20} tintColor={theme.tint} />
            </View>
            <View style={styles.grow}>
              <ThemedText type="smallBold" themeColor="heading">Automatic</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">The city you fly from and spend time in{automatic ? ` · ${automatic.city} now` : ''}</ThemedText>
            </View>
            {chosen === 'auto' ? currentTag : chevron}
          </Pressable>
        )}
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search a city or airport"
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          accessibilityLabel="Search a city or airport"
          testID="home-city-search"
          style={[styles.search, { backgroundColor: theme.field, color: theme.text, borderColor: theme.hairline }]}
        />
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
          {searching ? 'Cities and airports' : 'From your flights'}
        </ThemedText>
        <SheenCard style={styles.list}>
          {options.length ? options.map(row) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {searching ? 'No city or airport matches that.' : 'Your flights will suggest cities here. Search for one meanwhile.'}
            </ThemedText>
          )}
        </SheenCard>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six + BottomTabInset, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  auto: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: 1, borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  search: { minHeight: 48, borderRadius: 16, borderWidth: 1, paddingHorizontal: Spacing.three, fontSize: 16, lineHeight: 20, letterSpacing: 0 },
  caps: { textTransform: 'uppercase', letterSpacing: 1.2 },
  list: { padding: 0, gap: 0, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  square: { width: 44, height: 44, borderRadius: 11, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, minWidth: 0 },
  empty: { padding: Spacing.three },
});
