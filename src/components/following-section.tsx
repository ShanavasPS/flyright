import { useAuth } from '@clerk/expo';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '../../convex/_generated/api';

import { AirlineLogo } from '@/components/airline-logo';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { STAGE_LABELS, type TravelStage } from '@/services/travel-day';

/** Live trips the user follows, at the top of My travels. The query is
 * reactive, so stage changes land here without any refresh. Render only
 * under CloudSync (Convex configured). */
export function FollowingSection() {
  const theme = useTheme();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const entries = useQuery(api.live.following, isSignedIn ? {} : 'skip');

  if (!entries?.length) return null;

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
        Following
      </ThemedText>
      {entries.map(({ sessionId, token, session }) => {
        const stage = session.currentStage as TravelStage | null;
        const stageLabel = stage ? STAGE_LABELS[stage] : 'Getting ready';
        const who = session.travelerName ?? 'Traveler';
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
                <ThemedText type="smallBold" themeColor="heading" numberOfLines={1}>
                  {who} · {session.fromCode} → {session.toCode}
                </ThemedText>
                <ThemedText type="small" numberOfLines={1} style={{ color: theme.tint }}>
                  {stageLabel}
                  {session.delayMinutes != null && session.delayMinutes >= 30
                    ? ` · ${session.delayMinutes} min late`
                    : ''}
                  {session.gate ? ` · Gate ${session.gate}` : ''}
                </ThemedText>
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
});
