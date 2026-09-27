/** Which picture a home base city shows: Wikipedia's, one of the
 * traveller's own, or the flag (services/city-photo, docs/home-base.md). */
import { useAuth } from '@clerk/expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { CityThumb, photoCredit } from '@/components/city-photo';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { flagArt } from '@/components/trip-group-mark';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { countryName } from '@/services/airports';
import { setPhotoChoice, useCityPhoto, usePhotoChoice } from '@/services/city-photo';
import { PhotoPermissionError, pickImages } from '@/services/photos';
import { cityCoverKey, setTripCover } from '@/services/trip-covers';

export function HomePhoto() {
  const { userId } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { city = '', country = '' } = useLocalSearchParams<{ city?: string; country?: string }>();
  const place = { city, country };
  const choice = usePhotoChoice(place);
  // Wikipedia's photo is offered whatever this phone shows now.
  const wiki = useCityPhoto(place, { wikiOnly: true });
  const shown = useCityPhoto(place);
  const art = flagArt(country);

  // The city's synced choice (services/trip-covers) wins over this phone's,
  // so every choice here resets it: the city then shows what was picked.
  const choose = (kind: 'wiki' | 'none') => {
    void setPhotoChoice(place, { kind });
    setTripCover(userId, cityCoverKey(place), kind === 'none' ? { kind: 'none', photoId: null } : null);
    router.back();
  };
  const chooseOwn = async () => {
    try {
      const [picked] = await pickImages('library', { limit: 1 });
      if (!picked) return;
      await setPhotoChoice(place, { kind: 'own', pickedUri: picked.uri });
      setTripCover(userId, cityCoverKey(place), null);
      router.back();
    } catch (error) {
      if (error instanceof PhotoPermissionError) {
        Alert.alert('Photos are off for FlyRight', 'Allow photo access in Settings to use one of your own.');
      } else {
        Alert.alert('That photo could not be used', 'Try another one.');
      }
    }
  };

  const check = (on: boolean) => on
    ? <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={22} tintColor={theme.tint} />
    : null;
  const wikiCredit = photoCredit(wiki);

  return (
    <ThemedView style={styles.container}>
      {/* Plain layout on purpose: a vertical ScrollView inside a formSheet is
          captured by the sheet (claim-letter.tsx), and on iOS 26+ it collapsed
          to zero height under the sheet's safe-area wrapper — the sheet came
          up empty in 1.1.5. The content fits the sheet. */}
      <View style={styles.content}>
        <View style={styles.header}>
          <ThemedText type="subtitle" themeColor="heading" style={styles.grow} accessibilityRole="header">Photo for {city}</ThemedText>
          <Pressable accessibilityRole="button" hitSlop={12} onPress={() => router.back()} testID="home-photo-done">
            <ThemedText type="link" themeColor="tint">Done</ThemedText>
          </Pressable>
        </View>
        <SheenCard style={styles.list}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: choice.kind === 'wiki' }}
            accessibilityLabel={`From Wikipedia${wikiCredit ? `, ${wikiCredit}` : ''}`}
            onPress={() => choose('wiki')}
            testID="home-photo-wiki"
            style={[styles.row, { borderBottomColor: theme.hairline }]}>
            <CityThumb place={place} photo={wiki} />
            <View style={styles.grow}>
              <ThemedText type="smallBold" themeColor="heading">From Wikipedia</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {wikiCredit ?? (wiki.status === 'loading' ? 'Looking for one…' : 'No photo found for this city')}
              </ThemedText>
            </View>
            {check(choice.kind === 'wiki')}
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: choice.kind === 'own' }}
            accessibilityLabel="One of your photos"
            onPress={() => void chooseOwn()}
            testID="home-photo-own"
            style={[styles.row, { borderBottomColor: theme.hairline }]}>
            {choice.kind === 'own'
              ? <CityThumb place={place} photo={shown} />
              : (
                <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
                  <SymbolView name={{ ios: 'photo.on.rectangle', android: 'add_photo_alternate', web: 'add_photo_alternate' }} size={22} tintColor={theme.heading} />
                </View>
              )}
            <View style={styles.grow}>
              <ThemedText type="smallBold" themeColor="heading">One of your photos</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{choice.kind === 'own' ? 'Tap to pick another' : 'From your photo library'}</ThemedText>
            </View>
            {check(choice.kind === 'own')}
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: choice.kind === 'none' }}
            accessibilityLabel={`No photo, show the ${countryName(country)} flag`}
            onPress={() => choose('none')}
            testID="home-photo-none"
            style={[styles.row, styles.last]}>
            <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
              {!!art && <SvgXml xml={art} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />}
            </View>
            <View style={styles.grow}>
              <ThemedText type="smallBold" themeColor="heading">No photo</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Show the {countryName(country)} flag instead</ThemedText>
            </View>
            {check(choice.kind === 'none')}
          </Pressable>
        </SheenCard>
        <ThemedText type="small" themeColor="textSecondary">
          Wikipedia&apos;s photo is downloaded once and kept on this phone, with its photographer and licence shown as the licence asks. Your own photo stays on this phone.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, paddingTop: Spacing.four, gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  grow: { flex: 1, minWidth: 0 },
  list: { padding: 0, gap: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, borderBottomWidth: StyleSheet.hairlineWidth },
  last: { borderBottomWidth: 0 },
  icon: { width: 48, height: 48, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
