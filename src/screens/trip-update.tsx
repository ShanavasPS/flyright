import { hasPro, useProLocked } from '@/services/purchases';
import { confirmServerPro } from '@/services/pro-access';
import { clearPostcardDraft, keepDraftPhoto, readPostcardDraft, removeDraftPhoto, savePostcardDraft } from '@/services/postcard-draft';
import { useAuth } from '@clerk/expo';
import { ConvexError } from 'convex/values';
import { useMutation } from 'convex/react';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
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
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { placeFor, updateWindowOpen } from '../../convex/updatesShared';

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
import { showFlash } from '@/services/flash';
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
  const { userId } = useAuth();
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  return <PostcardComposer key={`${userId ?? 'guest'}:${journeyId ?? ''}`} />;
}

function PostcardComposer() {
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

  const proLocked = useProLocked();
  const draftDone = useRef(false);
  const [draft] = useState(() => readPostcardDraft(userId, journeyId ?? ''));
  const [text, setText] = useState(draft.text);
  const [picked, setPicked] = useState<PickedImage | null>(draft.picked);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!draftDone.current && journeyId) savePostcardDraft(userId, journeyId, { text, picked });
  }, [userId, journeyId, text, picked]);
  const offerPro = () => router.push({ pathname: '/pro-offer', params: { journeyId: journeyId ?? '', feature: 'postcard' } });

  // From the moment the picker opens until it hands the photo over:
  // converting or fetching one from iCloud takes seconds after it closes,
  // and the photo slot says so instead of sitting empty.
  const [preparing, setPreparing] = useState(false);

  const canPost = !busy && !preparing && !!row && (text.trim().length > 0 || !!picked);

  const addPhoto = () =>
    showPhotoSourceMenu(async (source) => {
      setPreparing(true);
      try {
        const [image] = await pickImages(source, { limit: 1 });
        if (image) {
          const saved = keepDraftPhoto(image);
          if (picked) removeDraftPhoto(picked);
          setPicked(saved);
        }
      } catch (error) {
        if (error instanceof PhotoPermissionError) {
          Alert.alert(
            error.source === 'camera' ? 'Camera access needed' : 'Photo access needed',
            'Allow FlyRight in Settings to add a photo to your update.',
          );
        } else {
          Alert.alert('Could not add the photo', 'Something went wrong — please try again.');
        }
      } finally {
        setPreparing(false);
      }
    });

  const submit = async () => {
    if (!row || !canPost) return;
    if (visibilityOf(row) === 'private') {
      Alert.alert('This trip is only yours', 'Change who sees it from the trip menu to share postcards.');
      return;
    }
    if (!updateWindowOpen(row, Date.now(), travel.stamps.landed ?? row.actualArrival)) {
      Alert.alert('Postcards open on your flight day', 'Share from the day you fly until a day after you land. Your draft is saved.');
      return;
    }
    setBusy(true);
    try {
      if (!(await hasPro()) || !(await confirmServerPro())) { offerPro(); return; }
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
      draftDone.current = true;
      clearPostcardDraft(userId, row.id);
      noteSuccess();
      trackEvent('trip_update_posted', { photo: !!picked, chars: text.trim().length });
      // The composer closes on success; the trip underneath says it went
      // out, and to whom.
      showFlash('Update shared', sharedWith(visibilityOf(row), followers ?? []));
      router.back();
    } catch (error) {
      const code = error instanceof ConvexError ? String(error.data) : '';
      if (code === 'pro_required') {
        offerPro();
      } else if (code === 'WINDOW_CLOSED') {
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
      { text: 'Discard', style: 'destructive', onPress: () => { draftDone.current = true; clearPostcardDraft(userId, journeyId ?? ''); router.back(); } },
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
              <View style={[styles.headerButton, styles.posting]} accessibilityLabel="Posting">
                <ActivityIndicator size="small" />
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.headerLabel}>
                  Posting
                </ThemedText>
              </View>
            ) : (
              <HeaderButton label={proLocked ? "Post with Pro" : "Post"} bold disabled={!canPost} onPress={submit} />
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
        <ThemedText type="small" themeColor="textSecondary">Postcards need Pro and can be shared from your flight day until a day after landing. Your people read them free.</ThemedText>
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
          style={[styles.editor, { color: theme.text }, busy && styles.dimmed]}
        />
        {remaining <= 40 && (
          <ThemedText type="small" themeColor={remaining === 0 ? 'danger' : 'textSecondary'} style={styles.counter}>
            {remaining} left
          </ThemedText>
        )}

        {preparing && !picked ? (
          <View
            accessibilityLabel="Preparing your photo"
            style={[styles.photo, styles.preparing, { backgroundColor: theme.field }]}>
            <ActivityIndicator color={theme.tint} />
            <ThemedText type="smallBold" themeColor="textSecondary">
              Preparing your photo…
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Large or iCloud photos take a few seconds
            </ThemedText>
          </View>
        ) : picked ? (
          <View>
            <Image
              source={{ uri: picked.uri }}
              contentFit="cover"
              accessibilityIgnoresInvertColors
              style={[styles.photo, { aspectRatio: photoAspect(picked), backgroundColor: theme.field }]}
            />
            {busy && (
              <View style={styles.uploading} accessibilityLabel="Uploading photo">
                <ThemedText type="smallBold" style={styles.uploadingText}>
                  Uploading photo
                </ThemedText>
                <IndeterminateBar />
              </View>
            )}
            {!busy && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                hitSlop={Spacing.two}
                onPress={() => { if (picked) removeDraftPhoto(picked); setPicked(null); }}
                style={({ pressed }) => [styles.removePhoto, pressed && styles.pressed]}>
                <SymbolView
                  name={{ ios: 'xmark', android: 'close', web: 'close' }}
                  size={14}
                  tintColor="#FFFFFF"
                />
              </Pressable>
            )}
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

/** "Clara, Noah & Sofia can see it now" — the toast's line once it is out. */
function sharedWith(
  visibility: ReturnType<typeof visibilityOf>,
  followers: { name: string | null; close: boolean }[],
): string {
  const people = visibility === 'close' ? followers.filter((f) => f.close) : followers;
  if (people.length) return `${watcherNames(people)} can see it now`;
  return visibility === 'close'
    ? 'Your close circle will see it on this trip'
    : 'Your circle will see it on this trip';
}

/** A bar that runs without a number — the upload has no progress to report
 * (see photo-files: it goes out in one request), only that it is moving. */
function IndeterminateBar() {
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1);
  }, [x]);
  const run = useAnimatedStyle(() => ({ left: `${x.value * 70 - 10}%` }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.runner, run]} />
    </View>
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
  dimmed: { opacity: 0.5 },
  preparing: {
    aspectRatio: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  uploading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    backgroundColor: 'rgba(7,15,32,0.4)',
  },
  uploadingText: { color: '#FFFFFF' },
  track: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  runner: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '40%',
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  posting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
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
