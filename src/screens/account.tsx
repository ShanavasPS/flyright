import { UserProfileView } from '@clerk/expo/native';
import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';

/**
 * Clerk's prebuilt native account management: profile, email addresses,
 * connected accounts, and account deletion (required by App Store review
 * once registration exists — deletion is enabled per-instance in the Clerk
 * dashboard under User & authentication).
 *
 * The route's own header is hidden (see the settings stack layout) and
 * onHostBack pops the route instead, so Clerk's chrome is the only header —
 * otherwise its sub-screens show two stacked back buttons. onHostBack fires
 * only on an explicit tap of Clerk's root back button, unlike onDismiss,
 * which fires on native viewWillDisappear — before the JS navigator knows
 * about a header-back pop — so wiring that one to router.back() double-pops
 * and bubbles out of the settings stack into the tab navigator.
 */
export function Account() {
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <UserProfileView isDismissible={false} onHostBack={() => router.back()} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
