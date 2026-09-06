import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Linking, Platform, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { STORE_URLS } from '@/constants/store-links';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { trackEvent } from '@/services/analytics';

/**
 * Where a link the app can't place ends up.
 *
 * Almost always a link from the future: a push or a shared URL naming a
 * screen that a later build added. FlyRight sends those from the server, to
 * whatever version each person happens to be running — so the app that
 * receives one may genuinely predate the screen it points at. Without this
 * route that tap went nowhere at all, silently, which is the worst possible
 * answer to the one gesture a notification exists for.
 *
 * So it says the likeliest true thing and offers the two ways out: update,
 * or go back to the journal. The event is tracked because a rise in it is
 * the signal that a server-side link has outrun the builds in people's
 * hands (see TRIP_DEEP_LINKS_LANDED in convex/circleInternal.ts).
 */
export default function NotFound() {
  const router = useRouter();
  const store = Platform.OS === 'android' ? STORE_URLS.android : STORE_URLS.ios;
  const storeName = Platform.OS === 'android' ? 'Google Play' : 'the App Store';

  // Once per arrival, not once per render.
  useEffect(() => trackEvent('deep_link_unmatched'), []);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: '' }} />
      <SafeAreaView style={styles.safeArea}>
        <Card>
          <ThemedText type="subtitle" themeColor="heading">
            This link needs a newer FlyRight
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Whatever it points at isn&apos;t in this version of the app. Updating usually
            fixes it — if it doesn&apos;t, the link has probably expired.
          </ThemedText>
          {Platform.OS !== 'web' && (
            <Pressable onPress={() => void Linking.openURL(store)}>
              <ThemedText type="link">Update on {storeName}</ThemedText>
            </Pressable>
          )}
          <PrimaryButton label="Back to my travels" onPress={() => router.replace('/')} />
        </Card>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  safeArea: {
    paddingHorizontal: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
