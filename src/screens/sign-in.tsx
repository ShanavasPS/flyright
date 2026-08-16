import { AuthView } from '@clerk/expo/native';
import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { useDismissOnce } from '@/hooks/use-dismiss-once';

/**
 * Clerk's prebuilt native auth UI (email code, Apple, Google — whatever the
 * instance enables). Presented as a form sheet; onDismiss also fires when the
 * flow completes, so the sheet closes itself after sign-in.
 */
export function SignIn() {
  // The sheet is only opened from Settings; revisit when other tabs get a CTA.
  const dismiss = useDismissOnce('/settings');

  return (
    <ThemedView style={styles.container}>
      <AuthView onDismiss={dismiss} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
