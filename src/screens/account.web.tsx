import { UserProfile } from '@clerk/expo/web';
import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** Web build renders Clerk's web account management UI. */
export function Account() {
  return (
    <ThemedView style={styles.container}>
      <UserProfile />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.four,
  },
});
