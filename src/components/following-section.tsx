import { useAuth } from '@clerk/expo';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '../../convex/_generated/api';

import { AirlineLogo } from '@/components/airline-logo';
import { RouteLeg } from '@/components/route-leg';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useNow } from '@/hooks/use-now';
import { followerStatus, liveTimes, sessionProgress } from '@/services/public-session';

/** Live trips the user follows, at the top of My travels. The query is
 * reactive, so stage changes land here without any refresh. Render only
 * under CloudSync (Convex configured). */
export function FollowingSection() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const entries = useQuery(api.live.following, isSignedIn ? {} : 'skip');
  const now = useNow();
  const theme = useTheme();

  if (!entries?.length) return null;

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
        Following
      </ThemedText>
      {entries.map(({ sessionId, token, session }) => {
        const who = session.travelerName ?? 'Traveler';
        const times = liveTimes(session);
        const { headline, detail, delayed } = followerStatus(session, now);
        return (
          <Pressable
            key={sessionId}
            accessibilityRole="button"
            disabled={!token}
            onPress={() =>
              token && router.push({ pathname: '/t/[token]', params: { token } })
            }
            style={({ pressed }) => pressed && styles.pressed}>
            <SheenCard style={styles.row}>
              <AirlineLogo number={session.number} carrier={session.carrier} />
              <View style={styles.body}>
                <View style={styles.nameRow}>
                  <ThemedText
                    type="smallBold"
                    themeColor="heading"
                    numberOfLines={1}
                    style={styles.name}>
                    {who}
                  </ThemedText>
                  {/* "Departs in 2h 15m", "Lands in 45m", "Landed 8:55" — the
                      row's right slot, where the journal's rows keep their
                      countdown too. */}
                  <ThemedText
                    type="smallBold"
                    themeColor="heading"
                    numberOfLines={1}
                    style={delayed && { color: theme.warning }}>
                    {headline}
                  </ThemedText>
                </View>
                {detail && (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {detail}
                  </ThemedText>
                )}
                {/* The leg with the clocks the airline now says — a follower
                    is waiting to know WHEN, and "HEL → LHR" never said. */}
                <RouteLeg
                  compact
                  progress={sessionProgress(session, now)}
                  leg={{ fromCode: session.fromCode, toCode: session.toCode, ...times }}
                />
              </View>
            </SheenCard>
          </Pressable>
        );
      })}
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
  pressed: {
    opacity: 0.9,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: { flex: 1 },
});
