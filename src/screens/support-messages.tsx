import { useAuth } from '@clerk/expo';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { api } from '../../convex/_generated/api';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CONVEX_URL } from '@/constants/config';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMessageTime } from '@/services/support';

/** Settings → Contact support, for a signed-in user: every conversation with
 * support, newest first, plus the door to a new one. Anonymous users skip
 * this and go straight to the form (see settings.tsx). */
export function SupportMessages() {
  const router = useRouter();
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <PrimaryButton label="New message" onPress={() => router.push('/contact')} />
        {CONVEX_URL ? <ThreadList /> : null}
      </ScrollView>
    </ThemedView>
  );
}

function ThreadList() {
  const theme = useTheme();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const threads = useQuery(api.support.myThreads, isSignedIn ? {} : 'skip');

  if (!threads || threads.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
        {threads === undefined
          ? 'Loading…'
          : 'No conversations yet. Start one with New message — we reply by email.'}
      </ThemedText>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.group}>
      {threads.map((t, i) => (
        <View key={t.id}>
          {i > 0 && <ThemedView type="backgroundSelected" style={styles.separator} />}
          <Pressable
            testID={`support-thread-${i}`}
            onPress={() => router.push(`/messages/${t.id}`)}
            style={({ pressed }) => [styles.row, pressed && styles.pressedRow]}>
            <View style={styles.rowText}>
              <View style={styles.titleRow}>
                {t.unread && <View style={[styles.dot, { backgroundColor: theme.tint }]} />}
                <ThemedText type={t.unread ? 'smallBold' : 'small'} numberOfLines={1} style={styles.title}>
                  {t.subject}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                {t.lastDirection === 'out' ? 'Support: ' : 'You: '}
                {t.lastPreview}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {formatMessageTime(t.lastMessageAt)}
            </ThemedText>
          </Pressable>
        </View>
      ))}
    </ThemedView>
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
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.four,
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
  pressedRow: {
    opacity: 0.7,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.four,
  },
});
