/** A destination's photo, for all its trips or just the one the traveller
 * came from: one of their photos from those trips (the trip journal), a new
 * one from the library (added to the journal), Wikipedia's, or none
 * (docs/trip-covers.md). */
import { useAuth } from '@clerk/expo';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { CityThumb, photoCredit } from '@/components/city-photo';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { flagArt } from '@/components/trip-group-mark';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { countryName } from '@/services/airports';
import { useCityPhoto } from '@/services/city-photo';
import { importPhotos, PhotoPermissionError, pickImages, useTripPhotos } from '@/services/photos';
import { usePlacePhoto } from '@/components/trip-cover';
import { cityCoverKey, setTripCover, useTripCovers } from '@/services/trip-covers';

export function TripPhoto() {
  const { userId } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{ city?: string; country?: string; title?: string; cityJourneys?: string; group?: string; groupLabel?: string; journeys?: string }>();
  const place = useMemo(() => ({ city: params.city ?? '', country: params.country ?? '' }), [params.city, params.country]);
  const split = (list?: string) => (list ?? '').split(',').filter(Boolean);
  const cityJourneys = useMemo(() => split(params.cityJourneys), [params.cityJourneys]);
  const groupJourneys = useMemo(() => split(params.journeys), [params.journeys]);
  const canScope = !!params.group;
  const [scope, setScope] = useState<'city' | 'trip'>('city');
  const forTrip = canScope && scope === 'trip';
  const key = forTrip ? params.group! : cityCoverKey(place);
  const journeyIds = forTrip ? groupJourneys : cityJourneys;
  const photos = useTripPhotos(journeyIds);
  const cover = useTripCovers(userId).covers[key];
  const wiki = useCityPhoto(place, { wikiOnly: true });
  const cityPhoto = usePlacePhoto(forTrip ? place : null);
  const credit = photoCredit(wiki);
  const art = flagArt(place.country);

  const choose = (next: Parameters<typeof setTripCover>[2]) => {
    setTripCover(userId, key, next);
    router.back();
  };
  const addFromLibrary = async () => {
    // A new photo joins the journal of the trip it's for (the newest one for all trips).
    if (!journeyIds[0]) return;
    try {
      const picked = await pickImages('library', { limit: 1 });
      if (!picked.length) return;
      const [id] = await importPhotos(journeyIds[0], userId, picked);
      if (id) choose({ kind: 'photo', photoId: id });
    } catch (error) {
      if (error instanceof PhotoPermissionError) Alert.alert('Photos are off for FlyRight', 'Allow photo access in Settings to use one of your own.');
      else Alert.alert('That photo could not be added', 'Try another one.');
    }
  };

  const check = (on: boolean) => on
    ? <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={22} tintColor={theme.tint} />
    : null;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ThemedText type="subtitle" themeColor="heading" style={styles.grow} accessibilityRole="header" numberOfLines={2}>
            Photo for {params.title ?? place.city}
          </ThemedText>
          <Pressable accessibilityRole="button" hitSlop={12} onPress={() => router.back()} testID="trip-photo-done">
            <ThemedText type="link" themeColor="tint">Done</ThemedText>
          </Pressable>
        </View>

        {canScope && (
          <View style={[styles.segment, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]} accessibilityRole="tablist">
            {(['city', 'trip'] as const).map((s) => (
              <Pressable
                key={s}
                accessibilityRole="tab"
                accessibilityState={{ selected: scope === s }}
                onPress={() => setScope(s)}
                testID={`trip-photo-scope-${s}`}
                style={[styles.segmentItem, scope === s && { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="smallBold" themeColor={scope === s ? 'heading' : 'textSecondary'} numberOfLines={1}>
                  {s === 'city' ? `All ${place.city} trips` : `Only ${params.groupLabel ?? 'this trip'}`}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
          {forTrip ? 'Your photos from this trip' : `Your photos from ${place.city}`}
        </ThemedText>
        <View style={styles.grid}>
          {(photos ?? []).map((p) => {
            const on = cover?.kind === 'photo' && cover.photoId === p.id;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`Your photo${on ? ', chosen' : ''}`}
                onPress={() => choose({ kind: 'photo', photoId: p.id })}
                testID={`trip-photo-journal-${p.id}`}
                style={[styles.tile, on && { borderColor: theme.tint, borderWidth: 3 }]}>
                <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              </Pressable>
            );
          })}
          {!!journeyIds[0] && <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a photo from your library"
            onPress={() => void addFromLibrary()}
            testID="trip-photo-add"
            style={[styles.tile, styles.add, { borderColor: theme.hairline }]}>
            <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={22} tintColor={theme.tint} />
          </Pressable>}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {forTrip
            ? 'Only this trip changes; your other trips keep the city’s photo. '
            : `Changes ${place.city} everywhere: this page and every trip there. `}
          A photo you add goes into the trip journal and follows your account to your other phones.
        </ThemedText>

        <SheenCard style={styles.list}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: !cover }}
            accessibilityLabel={forTrip ? `Same as all ${place.city} trips` : `${place.city} from Wikipedia${credit ? `, ${credit}` : ''}`}
            onPress={() => choose(null)}
            testID="trip-photo-wiki"
            style={[styles.row, { borderBottomColor: theme.hairline }]}>
            <CityThumb place={place} photo={forTrip ? cityPhoto : wiki} size={44} />
            <View style={styles.grow}>
              <ThemedText type="smallBold" themeColor="heading">{forTrip ? `Same as all ${place.city} trips` : `${place.city} from Wikipedia`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {forTrip ? 'The city\u2019s photo' : credit ?? (wiki.status === 'loading' ? 'Looking for one…' : 'No photo found for this city')}
              </ThemedText>
            </View>
            {check(!cover)}
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: cover?.kind === 'none' }}
            accessibilityLabel={`No photo, show the ${countryName(place.country)} flag`}
            onPress={() => choose({ kind: 'none', photoId: null })}
            testID="trip-photo-none"
            style={styles.row}>
            <View style={[styles.flag, { backgroundColor: theme.backgroundSelected }]}>
              {!!art && <SvgXml xml={art} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />}
            </View>
            <View style={styles.grow}>
              <ThemedText type="smallBold" themeColor="heading">No photo</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">The {countryName(place.country)} flag</ThemedText>
            </View>
            {check(cover?.kind === 'none')}
          </Pressable>
        </SheenCard>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, paddingTop: Spacing.four, gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  grow: { flex: 1, minWidth: 0 },
  caps: { textTransform: 'uppercase', letterSpacing: 1.2 },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, paddingHorizontal: Spacing.one, borderRadius: 9 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { width: 76, height: 76, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'transparent' },
  add: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed' },
  list: { padding: 0, gap: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, borderBottomWidth: StyleSheet.hairlineWidth },
  flag: { width: 44, height: 44, borderRadius: 11, overflow: 'hidden' },
});
