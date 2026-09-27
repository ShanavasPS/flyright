/** A home base city's photo, or its country's flag while the photo loads,
 * offline, when Wikipedia has nothing usable, or when the traveller chose
 * "No photo" (services/city-photo, docs/home-base.md). */
import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { flagArt } from '@/components/trip-group-mark';
import { useTheme } from '@/hooks/use-theme';
import type { CityPhoto } from '@/services/city-photo';
import type { HomePlace } from '@/services/home-base';

/** The flag stretched edge to edge like a banner, dimmed by `tone` so it
 * reads as a backdrop rather than a sticker. */
function FlagFill({ country, tone }: { country: string; tone: string }) {
  const art = flagArt(country);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tone }]}>
      {!!art && (
        <View style={[StyleSheet.absoluteFill, styles.flag]}>
          <SvgXml xml={art} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />
        </View>
      )}
    </View>
  );
}

/** Fills its parent: the photo, or the flag while there is none. */
export function CityPhotoFill({ place, photo, style }: { place: HomePlace; photo: CityPhoto; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Only while there is no photo: under a photo it showed through
          whenever the photo re-laid out (a collapsing header blinked). */}
      {photo.status !== 'ok' && <FlagFill country={place.country} tone={theme.backgroundSelected} />}
      {photo.status === 'ok' && (
        <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} cachePolicy="disk" />
      )}
    </View>
  );
}

/** A small square of the city for lists. */
export function CityThumb({ place, photo, size = 48 }: { place: HomePlace; photo: CityPhoto; size?: number }) {
  return (
    <View style={[styles.thumb, { width: size, height: size, borderRadius: size / 4 }]}>
      <CityPhotoFill place={place} photo={photo} />
    </View>
  );
}

/** "Ilya Grigorik · CC BY-SA 3.0": the licence asks for it wherever the photo shows. */
export function photoCredit(photo: CityPhoto): string | null {
  if (photo.status !== 'ok' || photo.own) return null;
  return [photo.credit, photo.licence].filter(Boolean).join(' · ') || 'Wikimedia Commons';
}

export function PhotoCredit({ photo, style }: { photo: CityPhoto; style?: StyleProp<ViewStyle> }) {
  const credit = photoCredit(photo);
  if (!credit) return null;
  return (
    <View style={style} accessibilityLabel={`Photo: ${credit}, from Wikimedia Commons`}>
      <ThemedText type="small" style={styles.credit} numberOfLines={1}>{credit}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flag: { opacity: 0.55 },
  thumb: { overflow: 'hidden' },
  credit: { fontSize: 10, lineHeight: 13, color: 'rgba(255,255,255,0.78)' },
});
