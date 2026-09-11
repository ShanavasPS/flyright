import { useAuth } from '@clerk/expo';
import { ConvexError } from 'convex/values';
import { useMutation } from 'convex/react';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { placeFor } from '../../convex/updatesShared';

import { DataErrorState, LoadingState, MissingState } from '@/components/data-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useCircleFollowers } from '@/components/trip-audience';
import { showPhotoSourceMenu } from '@/components/trip-photos';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { trackEvent } from '@/services/analytics';
import { airportZone } from '@/services/airports';
import { watcherNames } from '@/services/circle';
import { formatDayLabelWithYear } from '@/services/dates';
import { noteSuccess } from '@/services/haptics';
import { useJourney } from '@/services/journeys';
import {
  PhotoPermissionError,
  importPhotos,
  markPhotoUploaded,
  photoById,
  pickImages,
  uploadPhoto,
  type PickedImage,
} from '@/services/photos';
import { useTravelDay } from '@/services/travel-day-store';
import { UPDATE_TEXT_MAX, photoAspect, updateContext } from '@/services/trip-updates';
import { visibilityOf } from '@/services/trip-visibility';

/**
 * "Share an update": the composer for what a traveller posts from inside a
 * trip. The words go first — a caption's worth, with the photo under them
 * — and the two lines beneath say what the app adds on its own: where they
 * are right now, and who will see it. Nothing else to fill in; the moment
 * is the point.
 *
 * A card modal like the notes editor, so the keyboard has the room. The
 * field sits at the top of the card and is never under the keyboard.
 */
export function TripUpdateComposer() {
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { userId } = useAuth();
  const { row, loaded, error } = useJourney(journeyId ?? '', userId);
  const now = useNow();
  const travel = useTravelDay(row?.id ?? '');
  const followers = useCircleFollowers();
  const post = useMutation(api.updates.post);
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl);

  const [text, setText] = useState('');
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [busy, setBusy] = useState(false);

  const canPost = !busy && !!row && (text.trim().length > 0 || !!picked);

  const addPhoto = () =>
    showPhotoSourceMenu(async (source) => {
      try {
        const [image] = await pickImages(source, { limit: 1 });
        if (image) setPicked(image);
      } catch (error) {
        if (error instanceof PhotoPermissionError) {
          Alert.alert(
            error.source === 'camera' ? 'Camera access needed' : 'Photo access needed',
            'Allow FlyRight in Settings to add a photo to your update.',
          );
        } else {
          Alert.alert('Could not add the photo', 'Something went wrong — please try again.');
        }
      }
    });

  const submit = async () => {
    if (!row || !canPost) return;
    setBusy(true);
    try {
      // The photo is filed in the journal first — it is the traveller's own
      // record either way — then its bytes go up, and the update points at
      // the same file (see convex/updates.ts on why neither may free it).
      let photo: { photoId: string; storageId: Id<'_storage'>; width: number | null; height: number | null } | null =
        null;
      if (picked) {
        const [photoId] = await importPhotos(row.id, userId, [picked]);
        const stored = photoId ? await photoById(photoId) : undefined;
        if (!photoId || !stored) throw new Error('Photo not saved');
        const storageId = (await uploadPhoto(stored, await generateUploadUrl())) as Id<'_storage'>;
        await markPhotoUploaded(photoId, storageId);
        photo = { photoId, storageId, width: stored.width, height: stored.height };
      }
      await post({
        journeyKey: row.id,
        text: text.trim(),
        storageId: photo?.storageId ?? null,
        photoId: photo?.photoId ?? null,
        width: photo?.width ?? null,
        height: photo?.height ?? null,
        stage: travel.stage,
      });
      noteSuccess();
      trackEvent('trip_update_posted', { photo: !!picked, chars: text.trim().length });
      router.back();
    } catch (error) {
      const code = error instanceof ConvexError ? String(error.data) : '';
      if (code === 'WINDOW_CLOSED') {
        Alert.alert('This trip is over', 'Updates can be shared from the day you fly until a day after you land.');
      } else if (code === 'PRIVATE_TRIP') {
        Alert.alert('This trip is only yours', 'Change who sees it from the trip menu to share updates.');
      } else {
        Alert.alert('Could not post', 'Check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (!text.trim() && !picked) {
      router.back();
      return;
    }
    Alert.alert('Discard this update?', undefined, [
      { text: 'Keep writing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const headerOptions = {
    title: 'Share an update',
    headerTitleAlign: 'center' as const,
    headerLeft: () => <HeaderButton label="Cancel" onPress={cancel} />,
  };

  if (error || !loaded || !row) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={headerOptions} />
        {error ? (
          <DataErrorState error={error} title="Couldn't read this trip" />
        ) : !loaded ? (
          <LoadingState />
        ) : (
          <MissingState
            title="This trip isn't in your journal"
            detail="It may have been removed on another device, or the link is out of date."
          />
        )}
      </ThemedView>
    );
  }

  const tripLine = [
    row.number,
    `${row.fromCode} → ${row.toCode}`,
    formatDayLabelWithYear(row.scheduledDeparture, airportZone(row.fromCode)),
  ]
    .filter(Boolean)
    .join(' · ');
  // The same rule the server stamps the post with, run here so the
  // traveller sees the line before they post it.
  const context = updateContext({ stage: travel.stage, place: placeFor(row, travel.stage, now.getTime()) });
  const audience = audienceLine(visibilityOf(row), followers ?? []);
  const remaining = UPDATE_TEXT_MAX - text.length;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          ...headerOptions,
          headerRight: () =>
            busy ? (
              <ActivityIndicator style={styles.headerButton} />
            ) : (
              <HeaderButton label="Post" bold disabled={!canPost} onPress={submit} />
            ),
        }}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {tripLine}
        </ThemedText>
        <TextInput
          testID="trip-update-editor"
          autoFocus
          multiline
          value={text}
          onChangeText={(t) => setText(t.slice(0, UPDATE_TEXT_MAX))}
          maxLength={UPDATE_TEXT_MAX}
          placeholder="What's happening?"
          placeholderTextColor={theme.textSecondary}
          textAlignVertical="top"
          editable={!busy}
          style={[styles.editor, { color: theme.text }]}
        />
        {remaining <= 40 && (
          <ThemedText type="small" themeColor={remaining === 0 ? 'danger' : 'textSecondary'} style={styles.counter}>
            {remaining} left
          </ThemedText>
        )}

        {picked ? (
          <View>
            <Image
              source={{ uri: picked.uri }}
              contentFit="cover"
              accessibilityIgnoresInvertColors
              style={[styles.photo, { aspectRatio: photoAspect(picked), backgroundColor: theme.field }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              hitSlop={Spacing.two}
              disabled={busy}
              onPress={() => setPicked(null)}
              style={({ pressed }) => [styles.removePhoto, pressed && styles.pressed]}>
              <SymbolView
                name={{ ios: 'xmark', android: 'close', web: 'close' }}
                size={14}
                tintColor="#FFFFFF"
              />
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a photo"
            disabled={busy}
            onPress={addPhoto}
            style={({ pressed }) => [
              styles.addPhoto,
              { borderColor: theme.hairline, backgroundColor: theme.field },
              pressed && styles.pressed,
            ]}>
            <SymbolView
              name={{ ios: 'camera', android: 'photo_camera', web: 'photo_camera' }}
              size={20}
              tintColor={theme.tint}
            />
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              Add a photo
            </ThemedText>
          </Pressable>
        )}

        {/* What the app adds on its own — so the traveller knows the post
            will read "On board · Helsinki" without typing it, and who it
            goes to. */}
        <View style={[styles.autoBlock, { borderTopColor: theme.hairline }]}>
          {context && (
            <AutoLine
              icon={{ ios: 'location', android: 'location_on', web: 'location_on' }}
              text={context}
            />
          )}
          <AutoLine
            icon={{ ios: 'person.2', android: 'group', web: 'group' }}
            text={audience}
          />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

/** "To your circle · Anna & Sam" — who a post on this trip reaches. */
function audienceLine(
  visibility: ReturnType<typeof visibilityOf>,
  followers: { name: string | null; close: boolean }[],
): string {
  if (visibility === 'private') return 'Only you can see this trip';
  const people = visibility === 'close' ? followers.filter((f) => f.close) : followers;
  const who = visibility === 'close' ? 'your close circle' : 'your circle';
  return people.length ? `To ${who} · ${watcherNames(people)}` : `To ${who} · nobody yet`;
}

function AutoLine({
  icon,
  text,
}: {
  icon: ComponentProps<typeof SymbolView>['name'];
  text: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.autoLine}>
      <SymbolView name={icon} size={16} tintColor={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.autoText}>
        {text}
      </ThemedText>
    </View>
  );
}

function HeaderButton({
  label,
  bold,
  disabled,
  onPress,
}: {
  label: string;
  bold?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={Spacing.two}
      onPress={onPress}
      style={({ pressed }) => [styles.headerButton, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}>
      <ThemedText type={bold ? 'smallBold' : 'small'} style={[styles.headerLabel, { color: theme.tint }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  editor: {
    minHeight: 96,
    fontSize: 20,
    lineHeight: 28,
    paddingTop: 0,
    paddingHorizontal: 0,
  },
  counter: { textAlign: 'right', marginTop: -Spacing.two },
  photo: {
    width: '100%',
    borderRadius: Spacing.three,
  },
  removePhoto: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  addPhoto: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.three,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  pressed: { opacity: 0.6 },
  autoBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  autoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  autoText: { flex: 1 },
  headerButton: {
    paddingHorizontal: Platform.OS === 'android' ? Spacing.two : 0,
  },
  headerLabel: {
    fontSize: 17,
    lineHeight: 22,
  },
});
