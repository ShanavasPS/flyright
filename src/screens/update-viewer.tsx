import { useAuth } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/../convex/_generated/api';
import type { Id } from '@/../convex/_generated/dataModel';
import { Avatar } from '@/components/avatar';
import { useNow } from '@/hooks/use-now';
import { tapLight } from '@/services/haptics';
import { agoLabel, updateContext } from '@/services/trip-updates';

const INK = '#07101F';
const SHEET = '#0D1A2E';
const WHITE = '#F2F6FB';
const DIM = 'rgba(242,246,251,0.66)';
const HAIR = 'rgba(242,246,251,0.10)';
const HEART = '#D93036';
const TINT = '#1E6BE0';
const COMMENT_MAX = 300;

/** One shared trip photo, full screen, with the heart and the thread on it.
 *
 * Tapping a photo used to leave for the trip page, which answered a question
 * nobody had asked — you tapped the picture, you wanted the picture. The trip
 * is still one tap away at the bottom, for when that IS the question.
 *
 * It pages sideways through every photo on the same trip, so a traveller who
 * posted four from one airport reads as four, not four separate errands. */
export function UpdateViewer() {
  const { ownerId, journeyId, journeyKey, updateId, name } = useLocalSearchParams<{
    ownerId?: string;
    /** Somebody else's trip. */
    journeyId?: string;
    /** My own, which the device knows by its local id. */
    journeyKey?: string;
    updateId?: string;
    name?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow(60_000);
  const { width } = useWindowDimensions();
  const posts = useQuery(
    api.updates.forTrip,
    journeyId
      ? { journeyId: journeyId as Id<'journeys'> }
      : journeyKey
        ? { journeyKey }
        : 'skip',
  );
  const react = useMutation(api.updates.react);
  // Your own post: the server refuses a heart on it, so this counts rather
  // than offers. Who gave them is on the trip's own "Your updates" sheet.
  const { userId: me } = useAuth();
  const mine = !!me && me === ownerId;
  const [showing, setShowing] = useState<string | null>(updateId ?? null);
  const [talking, setTalking] = useState(false);
  const listRef = useRef<FlatList>(null);

  // Only the ones with a picture: this is the photo viewer, and a text-only
  // post has nothing to show full screen.
  const photos = useMemo(() => (posts ?? []).filter((p) => !!p.photoUrl), [posts]);
  const start = Math.max(0, photos.findIndex((p) => p.updateId === updateId));
  const current = photos.find((p) => p.updateId === showing) ?? photos[start] ?? null;

  if (posts === undefined) {
    return (
      <View style={[styles.screen, styles.centred]}>
        <ActivityIndicator color={WHITE} />
      </View>
    );
  }
  if (!current) {
    return (
      <View style={[styles.screen, styles.centred]}>
        <Text style={styles.gone}>This photo is no longer shared.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.goneAction}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const context = [updateContext(current), agoLabel(current.createdAt, now)].filter(Boolean).join(' · ');

  return (
    <View style={styles.screen}>
      <FlatList
        ref={listRef}
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.updateId}
        initialScrollIndex={start}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setShowing(photos[index]?.updateId ?? null);
        }}
        renderItem={({ item }) => (
          <View style={[styles.page, { width }]}>
            <Image
              source={{ uri: item.photoUrl! }}
              contentFit="contain"
              transition={120}
              recyclingKey={item.updateId}
              accessibilityLabel="Photo shared from the trip"
              style={styles.photo}
            />
          </View>
        )}
      />

      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={() => router.back()}>
          <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={20} tintColor={WHITE} />
        </Pressable>
        <Avatar name={name ?? 'Traveller'} imageUrl={null} size={32} />
        <View style={styles.who}>
          <Text numberOfLines={1} style={styles.name}>
            {name ?? 'Traveller'}
          </Text>
          {!!context && (
            <Text numberOfLines={1} style={styles.context}>
              {context}
            </Text>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Report this photo"
          hitSlop={12}
          onPress={() =>
            router.push({ pathname: '/report', params: { name: name ?? '', updateId: current.updateId } })
          }>
          <SymbolView name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' }} size={20} tintColor={WHITE} />
        </Pressable>
      </View>

      {photos.length > 1 && (
        <View style={styles.dots} pointerEvents="none">
          {photos.map((p) => (
            <View key={p.updateId} style={[styles.dot, p.updateId === current.updateId && styles.dotOn]} />
          ))}
        </View>
      )}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
        {!!current.text && <Text style={styles.caption}>{current.text}</Text>}
        <View style={styles.actions}>
          {mine ? (
            <View style={styles.action} accessible accessibilityLabel={`${current.reactions} likes`}>
              <SymbolView
                name={{ ios: 'heart.fill', android: 'favorite', web: 'favorite' }}
                size={24}
                tintColor={current.reactions > 0 ? HEART : DIM}
              />
              <Text style={[styles.count, current.reactions > 0 && { color: HEART }]}>{current.reactions}</Text>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={current.reacted ? 'Remove your like' : 'Like'}
              style={styles.action}
              onPress={() => {
                tapLight();
                void react({ updateId: current.updateId as Id<'tripUpdates'> });
              }}>
              <SymbolView
                name={{ ios: current.reacted ? 'heart.fill' : 'heart', android: 'favorite', web: 'favorite' }}
                size={24}
                tintColor={current.reacted ? HEART : WHITE}
              />
              {current.reactions > 0 && (
                <Text style={[styles.count, current.reacted && { color: HEART }]}>{current.reactions}</Text>
              )}
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Comments"
            style={styles.action}
            onPress={() => setTalking(true)}>
            <SymbolView
              name={{ ios: 'bubble.left', android: 'chat_bubble', web: 'chat_bubble' }}
              size={23}
              tintColor={WHITE}
            />
            {current.comments > 0 && <Text style={styles.count}>{current.comments}</Text>}
          </Pressable>
          <View style={styles.spacer} />
          <Pressable
            accessibilityRole="button"
            style={styles.action}
            onPress={() =>
              router.push(
                journeyId
                  ? {
                      pathname: '/person/[id]/trip/[journeyId]',
                      params: { id: ownerId ?? '', journeyId, focus: 'posts' },
                    }
                  : { pathname: '/journey/[id]', params: { id: journeyKey ?? '' } },
              )
            }>
            <Text style={styles.openTrip}>Open trip</Text>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              size={14}
              tintColor={DIM}
            />
          </Pressable>
        </View>
      </View>

      <CommentSheet
        visible={talking}
        updateId={current.updateId}
        onClose={() => setTalking(false)}
      />
    </View>
  );
}

/** The thread under one photo. Everyone the post is shown to may reply — the
 * server checks the trip's own privacy mode, not a separate rule. */
export function CommentSheet({
  visible,
  updateId,
  onClose,
}: {
  visible: boolean;
  updateId: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const now = useNow(60_000);
  const rows = useQuery(api.updates.comments, visible ? { updateId: updateId as Id<'tripUpdates'> } : 'skip');
  const send = useMutation(api.updates.comment);
  const remove = useMutation(api.updates.removeComment);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const post = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setDraft('');
    try {
      await send({ updateId: updateId as Id<'tripUpdates'>, text });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.sheetWrap}>
        <Pressable accessibilityLabel="Close comments" style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>
              {!rows ? 'Comments' : rows.length === 1 ? '1 comment' : `${rows.length} comments`}
            </Text>
            {/* A circle is a handful of people, so a thread is short: a
                scroll view sizes to its content and the sheet grows with it,
                where a list had to be told a height and clipped without one. */}
            <ScrollView style={styles.thread} contentContainerStyle={styles.threadBody} keyboardShouldPersistTaps="handled">
              {rows?.length === 0 && <Text style={styles.empty}>No replies yet. Say something.</Text>}
              {(rows ?? []).map((item) => (
                <Pressable
                  key={item.commentId}
                  onLongPress={() => item.mine && remove({ commentId: item.commentId as Id<'updateComments'> })}
                  delayLongPress={400}
                  accessibilityHint={item.mine ? 'Long press to delete' : undefined}
                  style={styles.comment}>
                  <Avatar name={item.name} imageUrl={item.imageUrl} size={30} />
                  <View style={styles.commentBody}>
                    <Text style={styles.commentWho}>
                      {item.name} <Text style={styles.commentAgo}>· {agoLabel(item.createdAt, now)}</Text>
                    </Text>
                    <Text style={styles.commentText}>{item.text}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <View style={[styles.composer, { paddingBottom: insets.bottom + 12 }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Add a comment…"
                placeholderTextColor={DIM}
                maxLength={COMMENT_MAX}
                multiline
                style={styles.input}
                accessibilityLabel="Add a comment"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Post comment"
                disabled={!draft.trim() || busy}
                onPress={post}
                style={[styles.send, (!draft.trim() || busy) && styles.sendOff]}>
                <SymbolView
                  name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
                  size={17}
                  tintColor="#FFFFFF"
                />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: INK },
  centred: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  gone: { color: WHITE, fontSize: 16, fontWeight: '600' },
  goneAction: { color: TINT, fontSize: 15, fontWeight: '700' },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', height: '100%' },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  who: { flex: 1, minWidth: 0 },
  name: { color: WHITE, fontSize: 14, fontWeight: '700' },
  context: { color: DIM, fontSize: 11 },
  dots: { position: 'absolute', bottom: 150, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(242,246,251,0.3)' },
  dotOn: { backgroundColor: WHITE },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, gap: 14 },
  caption: { color: WHITE, fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44 },
  count: { color: WHITE, fontSize: 15, fontWeight: '700' },
  spacer: { flex: 1 },
  openTrip: { color: DIM, fontSize: 13 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: SHEET, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 8 },
  grabber: { width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(242,246,251,0.22)', alignSelf: 'center' },
  sheetTitle: { color: WHITE, fontSize: 13, fontWeight: '700', letterSpacing: 0.6, paddingHorizontal: 16, paddingVertical: 12 },
  thread: { maxHeight: 320 },
  threadBody: { paddingHorizontal: 16, paddingBottom: 8, gap: 16 },
  empty: { color: DIM, fontSize: 14, paddingVertical: 8 },
  comment: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', alignSelf: 'stretch' },
  commentBody: { flex: 1, gap: 3 },
  commentWho: { color: WHITE, fontSize: 13, fontWeight: '700' },
  commentAgo: { color: DIM, fontWeight: '400' },
  commentText: { color: WHITE, fontSize: 14, lineHeight: 19 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HAIR,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    backgroundColor: 'rgba(242,246,251,0.08)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    color: WHITE,
    fontSize: 14,
  },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: TINT, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.4 },
});
