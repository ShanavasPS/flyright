import { useRouter, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSignedOutNotice } from '@/hooks/use-signed-out-notice';
import { useTheme } from '@/hooks/use-theme';
import { clearSignedOutNotice } from '@/services/signed-out-notice';

/**
 * "You were signed out" — the card that explains an empty account after a
 * session ran out on its own. Without it a traveller who opens the app for a
 * trip finds Settings asking them to sign in and wonders what broke; the
 * card says nothing broke and nothing is lost (the journal lives on the
 * phone), and offers the one tap that puts sync back. Renders nothing when
 * there is no pending notice. `next` is where sign-in should land afterwards.
 */
export function SignedOutNoticeCard({ next }: { next: Href }) {
  const router = useRouter();
  const theme = useTheme();
  const notice = useSignedOutNotice();
  if (!notice) return null;

  const who = notice.email ? ` as ${notice.email}` : '';

  return (
    <ThemedView type="backgroundElement" style={styles.card} testID="signed-out-notice">
      <View style={styles.row}>
        <SymbolView
          name={{
            ios: 'person.crop.circle.badge.exclamationmark',
            android: 'no_accounts',
            web: 'no_accounts',
          }}
          size={28}
          weight="regular"
          tintColor={theme.tint}
        />
        <View style={styles.copy}>
          <ThemedText style={styles.headline}>You were signed out</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Your sign-in ran out, which happens from time to time. Your trips are still on this
            phone. Sign back in{who} to keep syncing and following people.
          </ThemedText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={12}
          onPress={clearSignedOutNotice}
          style={({ pressed }) => pressed && styles.pressed}>
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={14}
            weight="bold"
            tintColor={theme.textSecondary}
          />
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        testID="signed-out-notice-sign-in"
        onPress={() => router.push({ pathname: '/sign-in', params: { next: String(next) } })}
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedText type="link">Sign back in</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  copy: {
    flex: 1,
    gap: Spacing.one,
  },
  headline: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
