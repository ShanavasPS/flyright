import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMessageTime } from '@/services/support';

/** One support conversation: the traveler's messages on the right, support's
 * replies (which arrive by email, see convex/support.ts) on the left, and a
 * reply box. Opening it clears the unread flag. */
export function SupportThread({ threadId }: { threadId: Id<'supportThreads'> }) {
  const theme = useTheme();
  const data = useQuery(api.support.thread, { threadId });
  const reply = useMutation(api.support.reply);
  const markRead = useMutation(api.support.markRead);
  const scrollRef = useRef<ScrollView>(null);
  const composerRef = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
  const androidKeyboardPad = useAndroidKeyboardPad(composerRef);

  // iOS: the tab bar and home indicator overlay the bottom edge, and
  // insets.bottom covers both (see world.tsx). With the keyboard up the
  // KeyboardAvoidingView already pads for it, so the inset would only float
  // the composer above the keyboard. Android: the native tab bar is in the
  // layout — nothing to add.
  const composerBottom = (Platform.OS === 'ios' && !keyboardOpen ? insets.bottom : 0) + Spacing.three;

  // Keep the newest message in view when the keyboard takes the lower half.
  useEffect(() => {
    if (keyboardOpen) scrollRef.current?.scrollToEnd({ animated: true });
  }, [keyboardOpen]);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.unread) markRead({ threadId }).catch(() => {});
  }, [data?.unread, markRead, threadId]);

  const onSend = async () => {
    setError(null);
    setSending(true);
    try {
      await reply({ threadId, message: draft });
      setDraft('');
    } catch (e) {
      setError(
        e instanceof ConvexError && typeof e.data === 'string' ? e.data : "Couldn't send right now.",
      );
    } finally {
      setSending(false);
    }
  };

  if (data === null) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ThemedText themeColor="textSecondary">Conversation not found.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* iOS: the built-in avoider, offset by the native stack header.
          Android: with edge-to-edge (gradle edgeToEdgeEnabled) the manifest's
          adjustResize no longer shrinks the window and KeyboardAvoidingView
          under-pads, so the composer lifts itself by its measured overlap with
          the keyboard instead (useAndroidKeyboardPad). */}
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}>
        <ScrollView
          ref={scrollRef}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          contentContainerStyle={styles.content}>
          {data === undefined && (
            <ThemedText type="small" themeColor="textSecondary">
              Loading…
            </ThemedText>
          )}
          {data?.messages.map((m) => {
            const mine = m.direction === 'in';
            return (
              <View key={m.id} style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                {/* Support's bubble uses the selected-surface tint: the elevated
                    surface is white on white here and read as bare text. */}
                <View
                  style={[
                    styles.bubble,
                    { backgroundColor: mine ? theme.tint : theme.backgroundSelected },
                  ]}>
                  <ThemedText style={mine ? styles.mineText : undefined}>{m.body}</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {mine ? 'You' : 'FlyRight support'} · {formatMessageTime(m.createdAt)}
                  {m.failed ? ' · not delivered yet' : ''}
                </ThemedText>
              </View>
            );
          })}
          {data && data.messages.every((m) => m.direction === 'in') && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              We reply within a day or two{data.relay ? ' — here and' : ''} to {data.email}.
            </ThemedText>
          )}
        </ScrollView>
        <View ref={composerRef} collapsable={false}>
        <ThemedView
          type="backgroundElement"
          style={[styles.composer, { paddingBottom: composerBottom + androidKeyboardPad }]}>
          <TextInput
            testID="reply-input"
            multiline
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a reply"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.field }]}
          />
          {error && (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {error}
            </ThemedText>
          )}
          <PrimaryButton
            label={sending ? 'Sending…' : 'Send'}
            onPress={onSend}
            disabled={sending || draft.trim().length === 0}
          />
        </ThemedView>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

/** iOS fires will-show/hide (animated in step with the keyboard); Android only
 * has did-show/hide. */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setOpen(true));
    const hide = Keyboard.addListener(hideEvent, () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

/** Android only: how far the composer must rise so its bottom edge meets the
 * keyboard's top edge, both in window coordinates. Re-measured on every show
 * event (the suggestion strip changes the keyboard height) and reset on hide.
 * Because the padding itself moves the composer, each measurement is a delta
 * on top of the padding already applied. */
function useAndroidKeyboardPad(composer: RefObject<View | null>) {
  const [pad, setPad] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const keyboardTop = e.endCoordinates.screenY;
      composer.current?.measureInWindow((_x, y, _w, h) => {
        setPad((prev) => Math.max(0, prev + (y + h - keyboardTop)));
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setPad(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [composer]);
  return pad;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  bubbleRow: {
    alignItems: 'flex-start',
    gap: Spacing.half,
    maxWidth: '85%',
  },
  bubbleRowMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubble: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  mineText: {
    color: '#ffffff',
  },
  hint: {
    textAlign: 'center',
    paddingTop: Spacing.two,
  },
  composer: {
    gap: Spacing.two,
    padding: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  input: {
    fontSize: 16,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    maxHeight: 140,
  },
});
