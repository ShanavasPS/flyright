import { UserProfileView } from '@clerk/expo/native';
import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';

/**
 * Clerk's prebuilt native account management: profile, email addresses,
 * connected accounts, and account deletion (required by App Store review
 * once registration exists — deletion is enabled per-instance in the Clerk
 * dashboard under User & authentication).
 *
 * isDismissible={false}: the stack header's back button is the only way out.
 * Clerk's onDismiss fires on native viewWillDisappear — before the JS
 * navigator knows about a header-back pop — so wiring it to router.back()
 * double-pops and bubbles out of the settings stack into the tab navigator.
 */
export function Account() {
  return (
    <ThemedView style={styles.container}>
      <UserProfileView isDismissible={false} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
