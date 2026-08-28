import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NotificationPitchArt } from '@/components/notification-pitch';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { reconcileNotifications } from '@/services/notification-lifecycle';
import { requestPushPermission } from '@/services/notifications';

/**
 * The "Remind me later" payoff: one follow-up sheet, a session (24h+) after
 * the onboarding push pitch was deferred. The journeys screen owns the
 * trigger and consumes the flag before presenting, so this shows at most
 * once — after it, add-flight's contextual ask is the only remaining path
 * to the one-shot OS prompt.
 */
export function NotificationPrime() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  /** Same contract as onboarding's enablePush: the OS alert fires only from
   * this tap, and either answer closes the sheet. */
  async function allow() {
    setBusy(true);
    try {
      await requestPushPermission();
      await reconcileNotifications();
    } finally {
      setBusy(false);
      router.back();
    }
  }

  return (
    <ThemedView
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, Spacing.four) }]}>
      <View style={styles.content}>
        <NotificationPitchArt />
        <ThemedText type="subtitle" themeColor="heading" style={styles.title}>
          Money alerts, one tap away
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.body}>
          You asked to be reminded: FlyRight can flag the moment a delay is
          worth up to €600 and keep claim deadlines from slipping.
        </ThemedText>
      </View>
      <View style={styles.footer}>
        <PrimaryButton label="Allow notifications" disabled={busy} onPress={() => void allow()} />
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.back()}>
          <ThemedText type="link" style={styles.footerLink}>
            Not now
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.five,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  body: {
    textAlign: 'center',
  },
  footer: {
    gap: Spacing.three,
  },
  footerLink: {
    textAlign: 'center',
  },
});
