import { Alert, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { presentCustomerCenter, restorePurchases, useHasPro } from '@/services/purchases';

export function Settings() {
  const hasPro = useHasPro();

  const onRestore = async () => {
    const restored = await restorePurchases();
    Alert.alert(
      restored ? 'Purchases restored' : 'Nothing to restore',
      restored ? 'Owed Pro is active on this device.' : 'No previous purchases were found.'
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Settings</ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="subtitle">
            {hasPro ? 'Owed Pro — active' : 'Free plan'}
          </ThemedText>
          <Pressable onPress={() => presentCustomerCenter()}>
            <ThemedText type="link">Manage subscription</ThemedText>
          </Pressable>
          <Pressable onPress={onRestore}>
            <ThemedText type="link">Restore purchases</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedText type="small">
          Owed generates claim documents for you to send yourself. It is not a law
          firm and takes no commission — you keep 100% of what you recover.
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
});
