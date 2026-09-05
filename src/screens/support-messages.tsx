import { useAuth } from '@clerk/expo';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '../../convex/_generated/api';

import { MicroLabel, PassAction, PassCard, PassDivider } from '@/components/pass-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MiniContrail, WHITE, WHITE_DIM } from '@/components/travel-stats-header';
import { CONVEX_URL } from '@/constants/config';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMessageTime } from '@/services/support';

/**
 * Settings → Contact support, and the home screen's messages button, for a
 * signed-in traveler: every conversation with support, newest first.
 * Anonymous users skip this and go straight to the form (see settings.tsx).
 *
 * Writing a new one is the header's pencil, not a button stacked above the
 * list — the inbox pattern every messaging app settled on (Pinterest,
 * Linktree, eBay, Outlook), so the conversations own the page and the action
 * stays in the same spot as the list grows. An inbox with nothing in it is
 * the one place a full-width invitation belongs, and it says so in the
 * night-sky hero the empty Trips, Claims and People tabs use.
 */
export function SupportMessages() {
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {CONVEX_URL ? <ThreadList /> : <EmptyInbox />}
      </ScrollView>
    </ThemedView>
  );
}

/** The compose door. Lives in the navigation bar — see the settings stack
 * layout, which mounts it as this route's headerRight. */
export function NewMessageButton() {
  const router = useRouter();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New message"
      testID="new-message"
      hitSlop={Spacing.three}
      onPress={() => router.push('/contact')}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      <SymbolView
        name={{ ios: 'square.and.pencil', android: 'edit_square', web: 'edit_square' }}
        size={22}
        weight="semibold"
        tintColor={theme.tint}
      />
    </Pressable>
  );
}

function ThreadList() {
  const theme = useTheme();
  const { isSignedIn } = useAuth();
  const threads = useQuery(api.support.myThreads, isSignedIn ? {} : 'skip');

  // A skipped query never resolves, so the signed-out case (which only
  // reaches here by deep link — Settings and the home button send anonymous
  // travelers to the form) takes the invitation, not a spinner.
  if (!isSignedIn) return <EmptyInbox />;
  // Nothing on screen until the answer is in: an empty hero that flashes for
  // a moment and is then replaced by a list reads as a glitch.
  if (threads === undefined) {
    return <ActivityIndicator color={theme.tint} style={styles.loading} />;
  }
  if (threads.length === 0) return <EmptyInbox />;

  return (
    <ThemedView type="backgroundElement" style={styles.group}>
      {threads.map((thread, i) => (
        <View key={thread.id}>
          {i > 0 && <ThemedView type="backgroundSelected" style={styles.separator} />}
          <ThreadRow thread={thread} index={i} />
        </View>
      ))}
    </ThemedView>
  );
}

type Thread = {
  id: string;
  subject: string;
  lastPreview: string;
  lastMessageAt: string;
  lastDirection: 'in' | 'out';
  unread: boolean;
};

/** One conversation: who it's with, what was said last, and when. The subject
 * carries the weight when there's a reply to read, and the tint dot sits on
 * the right edge where iOS Mail keeps it — the left edge stays a clean
 * column of avatars. */
function ThreadRow({ thread, index }: { thread: Thread; index: number }) {
  const theme = useTheme();
  const router = useRouter();
  const { subject, lastPreview, lastDirection, lastMessageAt, unread } = thread;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${subject}${unread ? ', unread' : ''}`}
      testID={`support-thread-${index}`}
      onPress={() => router.push(`/messages/${thread.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {/* The left column says where the conversation stands: a bubble when
          support has spoken (tinted while it's unread), a paper plane while
          the traveler is the one waiting for an answer. */}
      <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
        <SymbolView
          name={
            lastDirection === 'out'
              ? { ios: 'message.fill', android: 'chat', web: 'chat' }
              : { ios: 'paperplane.fill', android: 'send', web: 'send' }
          }
          size={17}
          tintColor={unread ? theme.tint : theme.textSecondary}
        />
      </View>
      <View style={styles.rowText}>
        <ThemedText
          type={unread ? 'smallBold' : 'small'}
          themeColor={unread ? 'heading' : 'text'}
          numberOfLines={1}>
          {subject}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {lastDirection === 'out' ? 'Support: ' : 'You: '}
          {lastPreview}
        </ThemedText>
      </View>
      <View style={styles.rowMeta}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
          {formatMessageTime(lastMessageAt)}
        </ThemedText>
        {unread && <View style={[styles.dot, { backgroundColor: theme.tint }]} />}
      </View>
    </Pressable>
  );
}

/** No conversations yet — the invitation, in the boarding-pass language of
 * the other empty tabs, and the one place the action is a full-width button. */
function EmptyInbox() {
  const router = useRouter();
  return (
    <PassCard testID="messages-empty">
      <View style={styles.spacedRow}>
        <MicroLabel>Support</MicroLabel>
        <MiniContrail />
      </View>
      <View style={styles.heroCopy}>
        <Text style={styles.heroHeadline}>No messages yet</Text>
        <Text style={styles.heroPitch}>
          Stuck on a flight, a claim, or your account? Write to us and the answer lands
          here — and in your email, so you&apos;ll see it either way.
        </Text>
      </View>
      <PassDivider />
      <PassAction
        label="New message"
        icon={{ ios: 'square.and.pencil', android: 'edit_square', web: 'edit_square' }}
        onPress={() => router.push('/contact')}
      />
    </PassCard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  loading: {
    paddingVertical: Spacing.five,
  },
  group: {
    borderRadius: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  // The time sits on the subject's line; the dot hangs below it, so an unread
  // row reads from either edge.
  rowMeta: {
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  time: {
    fontVariant: ['tabular-nums'],
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.four + 40 + Spacing.three,
  },
  spacedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroCopy: {
    gap: Spacing.two,
  },
  heroHeadline: {
    color: WHITE,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 700,
    letterSpacing: -0.3,
  },
  heroPitch: {
    color: WHITE_DIM,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: 500,
  },
});
