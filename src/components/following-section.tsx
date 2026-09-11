import { useAuth } from '@clerk/expo';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '../../convex/_generated/api';

import { LivePass } from '@/components/live-pass';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { onHomeScreen } from '@/services/public-session';

/** How many passes the home screen carries. It is the traveller's own
 * journal first; three people's flights is a glance, a whole circle on the
 * move is the People tab's page. */
export const HOME_PASSES_SHOWN = 3;

/** Live trips the user follows, at the top of My travels. The query is
 * reactive, so stage changes land here without any refresh. Render only
 * under CloudSync (Convex configured). */
export function FollowingSection() {
  const router = useRouter();
  const theme = useTheme();
  const { isSignedIn } = useAuth();
  const entries = useQuery(api.live.following, isSignedIn ? {} : 'skip');
  const now = useNow();

  // The session lives 48h past arrival so late stamps still find it; the
  // home screen lets a landed trip go two hours after the landing.
  const live = entries?.filter(({ session, onward }) => onHomeScreen(session, now, onward)) ?? [];
  if (!live.length) return null;
  // The server already orders one row per traveller; the first three are
  // the ones shown, the rest are a tap away.
  const shown = live.slice(0, HOME_PASSES_SHOWN);
  const more = live.length - shown.length;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
          Following
        </ThemedText>
        {more > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`See all ${live.length} people travelling`}
            testID="following-see-all"
            hitSlop={Spacing.two}
            onPress={() => router.navigate({ pathname: '/people', params: { tab: 'following' } })}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              See all {live.length}
            </ThemedText>
          </Pressable>
        )}
      </View>
      {shown.map(({ sessionId, session, onward, ownerId, owner, update }) => (
        <LivePass
          key={sessionId}
          person={owner}
          session={session}
          onward={onward}
          update={update}
          now={now}
          // The pass is a glance; the person's page is where the whole
          // journey — every leg, the layovers between — is laid out.
          onPress={() => router.push({ pathname: '/person/[id]', params: { id: ownerId } })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
    // Owns its top margin — the hero card above carries none.
    marginTop: Spacing.two,
    marginBottom: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pressed: { opacity: 0.6 },
});
