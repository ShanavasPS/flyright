import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { PhotoPermissionError, importPhotos, pickImages, usePhotos } from '@/services/photos';

const THUMB = 84;

/** The trip's photo strip: thumbnails that open the viewer, an add tile at
 * the end, and a prompt row when there are none yet. */
export function TripPhotos({
  journeyId,
  userId,
}: {
  journeyId: string;
  userId: string | null | undefined;
}) {
  const photos = usePhotos(journeyId);
  const router = useRouter();
  const theme = useTheme();

  const add = () =>
    showPhotoSourceMenu(async (source) => {
      try {
        const picked = await pickImages(source);
        await importPhotos(journeyId, userId, picked);
      } catch (error) {
        if (error instanceof PhotoPermissionError) {
          Alert.alert(
            error.source === 'camera' ? 'Camera access needed' : 'Photo access needed',
            'Allow FlyRight in Settings to add photos to this trip.',
          );
        } else {
          Alert.alert('Could not add the photo', 'Something went wrong — please try again.');
        }
      }
    });

  if (!photos.length) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add photos"
        onPress={add}
        style={({ pressed }) => [styles.prompt, { opacity: pressed ? 0.6 : 1 }]}>
        <SymbolView
          name={{ ios: 'photo.on.rectangle.angled', android: 'add_photo_alternate', web: 'add_photo_alternate' }}
          size={20}
          tintColor={theme.tint}
        />
        <View style={styles.promptText}>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            Add photos
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            The view from the window, the meal, the people you were with.
          </ThemedText>
        </View>
      </Pressable>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      style={styles.stripScroll}>
      {photos.map((photo) => (
        <Pressable
          key={photo.id}
          accessibilityRole="imagebutton"
          accessibilityLabel="Trip photo"
          onPress={() => router.push({ pathname: '/photo-viewer', params: { photoId: photo.id } })}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <Image
            source={{ uri: photo.uri }}
            recyclingKey={photo.id}
            contentFit="cover"
            transition={150}
            style={[styles.thumb, { backgroundColor: theme.field }]}
          />
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add photos"
        onPress={add}
        style={({ pressed }) => [
          styles.thumb,
          styles.addTile,
          { borderColor: theme.hairline, opacity: pressed ? 0.6 : 1 },
        ]}>
        <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={22} tintColor={theme.tint} />
      </Pressable>
    </ScrollView>
  );
}

/** Camera or library. iOS gets the native action sheet; Android the alert
 * with buttons that the trip menu already uses. */
function showPhotoSourceMenu(onPick: (source: 'camera' | 'library') => void) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Take photo', 'Choose from library', 'Cancel'], cancelButtonIndex: 2 },
      (index) => {
        if (index === 0) onPick('camera');
        if (index === 1) onPick('library');
      },
    );
    return;
  }
  Alert.alert('Add photos', undefined, [
    { text: 'Take photo', onPress: () => onPick('camera') },
    { text: 'Choose from library', onPress: () => onPick('library') },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

const styles = StyleSheet.create({
  prompt: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two + Spacing.half,
    paddingVertical: Spacing.one,
  },
  promptText: {
    flex: 1,
    gap: Spacing.half,
  },
  // Bleed the strip to the card's edges so the last thumb can peek.
  stripScroll: {
    marginHorizontal: -Spacing.four,
  },
  strip: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.one,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: Spacing.three,
  },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
});
