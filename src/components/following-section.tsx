import { useAuth } from '@clerk/expo';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { api } from '../../convex/_generated/api';

import { LivePass } from '@/components/live-pass';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { onHomeScreen } from '@/services/public-session';

/** Live trips the user follows, at the top of My travels. The query is
 * reactive, so stage changes land here without any refresh. Render only
 * under CloudSync (Convex configured). */
export function FollowingSection() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const entries = useQuery(api.live.following, isSignedIn ? {} : 'skip');
  const now = useNow();

  // The session lives 48h past arrival so late stamps still find it; the
  // home screen lets a landed trip go two hours after the landing.
  const shown = entries?.filter(({ session, onward }) => onHomeScreen(session, now, onward)) ?? [];
  if (!shown.length) return null;

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
        Following
      </ThemedText>
      {shown.map(({ sessionId, session, onward, ownerId, owner }) => (
        <LivePass
          key={sessionId}
          person={owner}
          session={session}
          onward={onward}
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
  title: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
