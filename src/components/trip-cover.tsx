/** A trip's header on Flights as a postcard: its destination's photo (or the
 * traveller's own, or the flag), the name and dates over it, and a button to
 * change the photo. The trip you moved on reads as a new home
 * (docs/trip-covers.md). */
import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { CityPhotoFill, PhotoCredit } from '@/components/city-photo';
import { ThemedText } from '@/components/themed-text';
import { flagArt, TripGroupFrame } from '@/components/trip-group-mark';
import { Spacing } from '@/constants/theme';
import { countryName } from '@/services/airports';
import { useCityPhoto, type CityPhoto } from '@/services/city-photo';
import { isMoveGroup, tripDestination } from '@/services/destination';
import type { HomePlace } from '@/services/home-base';
import { usePhoto } from '@/services/photos';
import { cityCoverKey, useTripCovers } from '@/services/trip-covers';
import type { TripGroup } from '@/services/trip-groups';

/** Tall enough for a photo to read as a place, short enough for a long list. */
export const TRIP_COVER_HEIGHT = 132;

export { isMoveGroup, tripDestination } from '@/services/destination';

function useCover(key: string | null): CityPhoto | null {
  const { userId } = useAuth();
  const cover = useTripCovers(userId).covers[key ?? ''];
  const journal = usePhoto(cover?.kind === 'photo' ? cover.photoId : '');
  if (!key || !cover) return null;
  if (cover.kind === 'none') return { status: 'none', choice: 'none' };
  // A journal photo that has gone (deleted, not synced here yet) falls back.
  return journal.row?.uri
    ? { status: 'ok', url: journal.row.uri, own: true, credit: null, licence: null, page: null }
    : null;
}

/** A city's photo everywhere it shows: the traveller's choice for the city
 * (synced), else this phone's home base choice or Wikipedia's. */
export function usePlacePhoto(place: HomePlace | null): CityPhoto {
  const chosen = useCover(place?.city && place.country ? cityCoverKey(place) : null);
  const wiki = useCityPhoto(chosen ? null : place);
  return chosen ?? wiki;
}

/** A trip's photo: its own choice, else its destination's. */
export function useTripCoverPhoto(group: TripGroup, place: HomePlace): CityPhoto {
  const own = useCover(group.id);
  const city = usePlacePhoto(own ? null : place);
  return own ?? city;
}

export const TripCoverHeader = memo(function TripCoverHeader({ group, dates, friend = false }: {
  group: TripGroup;
  dates: string;
  /** A friend's trip (person-travel): the destination's Wikipedia photo only
   * — the viewer's photo choices are theirs, the friend's are private — and
   * no page to open. */
  friend?: boolean;
}) {
  const router = useRouter();
  const { place, from } = tripDestination(group);
  const mine = useTripCoverPhoto(group, place);
  const wiki = useCityPhoto(friend ? place : null, { wikiOnly: true });
  const photo = friend ? wiki : mine;
  const moved = isMoveGroup(group);
  // "from Helsinki" for a move, the destination's country otherwise; each
  // with its flag, kept together so it wraps as one piece.
  const where = moved ? from : place;
  const whereName = moved ? (from?.city ?? '') : place.country ? countryName(place.country) : '';
  const whereFlag = where?.country ? flagArt(where.country) : null;
  const backdrop = (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <CityPhotoFill place={place} photo={photo} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim]} />
      <PhotoCredit photo={photo} style={styles.credit} />
    </View>
  );

  const open = () => router.push({ pathname: '/destination', params: { city: place.city, country: place.country, group: group.id } });

  return (
    <TripGroupFrame header backdrop={backdrop}>
      <Pressable
        accessibilityRole={friend ? 'header' : 'button'}
        accessibilityLabel={[moved ? 'New home' : '', group.title, dates, moved && whereName ? `from ${whereName}` : whereName].filter(Boolean).join(', ')}
        accessibilityHint={friend ? undefined : moved ? `Opens ${place.city}, your home` : `Opens all your trips to ${place.city}`}
        disabled={friend}
        onPress={open}
        style={styles.text}
        testID={`trip-group-${group.id}`}>
        {moved && (
          <View style={styles.newHome}>
            <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} size={11} tintColor="#FFFFFF" />
            <ThemedText type="smallBold" style={styles.newHomeText}>NEW HOME</ThemedText>
          </View>
        )}
        <ThemedText type="subtitle" style={styles.title} numberOfLines={2} accessibilityRole="header">{group.title}</ThemedText>
        <View style={styles.meta} accessible accessibilityLabel={[dates, moved && whereName ? `from ${whereName}` : whereName].filter(Boolean).join(', ')}>
          {!!dates && <ThemedText type="small" style={styles.subtitle}>{dates}</ThemedText>}
          {!!whereName && (
            <View style={styles.where}>
              {moved && <ThemedText type="small" style={styles.subtitle}>from</ThemedText>}
              {!!whereFlag && (
                <View style={styles.flag}>
                  <SvgXml xml={whereFlag} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />
                </View>
              )}
              <ThemedText type="small" style={[styles.subtitle, styles.shrink]}>{whereName}</ThemedText>
            </View>
          )}
        </View>
      </Pressable>
    </TripGroupFrame>
  );
});

const styles = StyleSheet.create({
  scrim: { experimental_backgroundImage: 'linear-gradient(180deg, rgba(7,15,32,0.35) 0%, rgba(7,15,32,0) 34%, rgba(7,15,32,0.1) 50%, rgba(12,27,54,0.92) 100%)' },
  credit: { position: 'absolute', right: Spacing.two, top: Spacing.two, maxWidth: '60%', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, backgroundColor: 'rgba(7,15,32,0.45)' },
  // The whole header is the button: at least a postcard's height, taller
  // when a long name or period wraps; the top keeps clear of the credit.
  text: { minHeight: 132, justifyContent: 'flex-end', paddingTop: 44, paddingBottom: Spacing.three, paddingHorizontal: Spacing.two, gap: 1 },
  title: { color: '#FFFFFF', fontSize: 22, lineHeight: 28 },
  subtitle: { color: 'rgba(214,227,244,0.95)', fontVariant: ['tabular-nums'] },
  // Dates, then flag + place: the second piece drops to its own line when
  // both don't fit, and a long country name wraps inside it.
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: Spacing.two, rowGap: 2 },
  where: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  shrink: { flexShrink: 1 },
  flag: { width: 18, height: 12, borderRadius: 2, overflow: 'hidden' },
  newHome: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 4, backgroundColor: 'rgba(7,15,32,0.55)' },
  newHomeText: { color: '#FFFFFF', fontSize: 10, lineHeight: 13, letterSpacing: 1.1 },
});
