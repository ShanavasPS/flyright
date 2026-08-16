import { SignIn as ClerkSignIn } from '@clerk/expo/web';
import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** Web build renders Clerk's web sign-in (the surface the web funnel uses). */
export function SignIn() {
  return (
    <ThemedView style={styles.container}>
      <ClerkSignIn />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
});
