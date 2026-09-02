import { AuthView } from '@clerk/expo/native';
import { useLocalSearchParams, type Href } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { useDismissOnce } from '@/hooks/use-dismiss-once';

/**
 * Clerk's prebuilt native auth UI (email code, Apple, Google — whatever the
 * instance enables). Presented as a form sheet; onDismiss also fires when the
 * flow completes, so the sheet closes itself after sign-in. Pass ?next=<href>
 * to land back on the screen that asked (an invite page, the People tab);
 * Settings is the default.
 */
export function SignIn() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const target = typeof next === 'string' && next.startsWith('/') ? (next as Href) : '/settings';
  const dismiss = useDismissOnce(target);

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
