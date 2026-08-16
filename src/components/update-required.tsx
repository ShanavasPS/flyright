import { Linking, Platform, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** Full-screen blocker shown when the server says this version may not run. */
export function UpdateRequired({ storeUrl }: { storeUrl: string | null }) {
  const storeName = Platform.OS === 'android' ? 'Google Play' : 'the App Store';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="title">Update required</ThemedText>
          <ThemedText>
            This version of FlyRight is no longer supported. Update to the latest version
            to keep tracking your flights and claims.
          </ThemedText>
          {storeUrl && (
            <Pressable onPress={() => void Linking.openURL(storeUrl)}>
              <ThemedText type="link">Update on {storeName}</ThemedText>
            </Pressable>
          )}
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  safeArea: {
    paddingHorizontal: Spacing.four,
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
});
