import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { retryUploads, uploadSummary, usePhotoUploadState } from '@/services/photo-upload-state';
import { PhotoPermissionError, importPhotos, pickImages, usePhotos } from '@/services/photos';

const THUMB = 84;

/** The trip's photo strip: thumbnails that open the viewer, an add tile at
 * the end, and a prompt row when there are none yet. Nothing about adding a
 * photo is silent: an "Adding…" tile holds the place while the picker hands
 * the files over (converting or fetching from iCloud can take seconds), each
 * of the traveller's photos not yet on the server shows its upload, and a
 * line under the strip says how far along it is — or that the photos wait
 * on the phone for a connection, with a Retry. */
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
  const uploads = usePhotoUploadState();
  // Set before the picker opens, so the tile is already there the moment it
  // closes; a cancel resolves at once and takes it away again.
  const [adding, setAdding] = useState(false);

  const add = () =>
    showPhotoSourceMenu(async (source) => {
      setAdding(true);
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
      } finally {
        setAdding(false);
      }
    });

  // Until the first read lands there is nothing to say: painting the "Add
  // photos" prompt and then swapping it for thumbnails reads as a glitch.
  if (!photos) return null;

  // Only the signed-in traveller's photos upload; signed out they stay on
  // the phone by design, and there is nothing to report.
  const pending = userId
    ? photos.filter((p) => p.userId === userId && !p.storageId).map((p) => p.id)
    : [];
  const summary = uploadSummary(pending, uploads);

  if (!photos.length && !adding) {
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
    <View style={styles.section}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        style={styles.stripScroll}>
        {photos.map((photo) => {
          const waiting = pending.includes(photo.id);
          const sending = waiting && uploads.uploading.has(photo.id);
          const failed = waiting && uploads.failed.has(photo.id);
          return (
            <Pressable
              key={photo.id}
              accessibilityRole="imagebutton"
              accessibilityLabel={
                sending ? 'Trip photo, uploading' : failed ? 'Trip photo, waiting to upload' : 'Trip photo'
              }
              onPress={() => router.push({ pathname: '/photo-viewer', params: { photoId: photo.id } })}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <Image
                source={{ uri: photo.uri }}
                recyclingKey={photo.id}
                contentFit="cover"
                transition={150}
                style={[styles.thumb, { backgroundColor: theme.field }]}
              />
              {sending && (
                <View style={[styles.thumb, styles.overlay, styles.sendingOverlay]}>
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              )}
              {failed && (
                <>
                  <View style={[styles.thumb, styles.overlay, styles.waitingOverlay]} />
                  <View style={[styles.waitBadge, { backgroundColor: theme.backgroundElement }]}>
                    <SymbolView
                      name={{ ios: 'icloud.slash', android: 'cloud_off', web: 'cloud_off' }}
                      size={12}
                      tintColor={theme.warning}
                    />
                  </View>
                </>
              )}
            </Pressable>
          );
        })}
        {adding && (
          <View
            accessibilityLabel="Adding photos"
            style={[styles.thumb, styles.addingTile, { backgroundColor: theme.field }]}>
            <ActivityIndicator color={theme.tint} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.addingText}>
              Adding…
            </ThemedText>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add photos"
          disabled={adding}
          onPress={add}
          style={({ pressed }) => [
            styles.thumb,
            styles.addTile,
            { borderColor: theme.hairline, opacity: pressed ? 0.6 : 1 },
          ]}>
          <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={22} tintColor={theme.tint} />
        </Pressable>
      </ScrollView>
      {adding && !summary ? (
        <View style={styles.status}>
          <ActivityIndicator size="small" color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.statusText}>
            Getting your photos ready…
          </ThemedText>
        </View>
      ) : summary?.kind === 'uploading' ? (
        <View style={styles.status}>
          <ActivityIndicator size="small" color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.statusText}>
            Uploading {summary.current} of {summary.total} · keeps going if you leave this screen
          </ThemedText>
        </View>
      ) : summary?.kind === 'waiting' ? (
        <View style={styles.status}>
          <SymbolView
            name={{ ios: 'icloud.slash', android: 'cloud_off', web: 'cloud_off' }}
            size={16}
            tintColor={theme.warning}
          />
          <ThemedText type="small" themeColor="textSecondary" style={styles.statusText}>
            {summary.count === 1 ? '1 photo' : `${summary.count} photos`} saved on this phone. They
            upload when you’re back online.
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry uploading photos"
            hitSlop={Spacing.two}
            onPress={retryUploads}
            style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              Retry
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** Camera or library. iOS gets the native action sheet; Android the alert
 * with buttons that the trip menu already uses. */
export function showPhotoSourceMenu(onPick: (source: 'camera' | 'library') => void) {
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
  section: {
    gap: Spacing.two,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendingOverlay: {
    backgroundColor: 'rgba(7,15,32,0.45)',
  },
  waitingOverlay: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  waitBadge: {
    position: 'absolute',
    right: Spacing.one,
    bottom: Spacing.one,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addingTile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  addingText: {
    fontSize: 11,
    lineHeight: 14,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusText: {
    flex: 1,
  },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
});
