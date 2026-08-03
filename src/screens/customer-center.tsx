import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import RevenueCatUI from 'react-native-purchases-ui';

import { CC_ACTION_CHANGE_PLAN, isPurchasesConfigured } from '@/services/purchases';

/**
 * Customer Center embedded on a pushed route (back button in the nav bar)
 * instead of the SDK's full-screen modal. Plan changes arrive as the
 * 'change_plan' custom action configured on its management screen; since this
 * is a push screen, the paywall can open immediately on tap.
 */
export function CustomerCenter() {
  const router = useRouter();

  if (!isPurchasesConfigured()) return null;

  return (
    <RevenueCatUI.CustomerCenterView
      style={styles.container}
      shouldShowCloseButton={false}
      onDismiss={() => router.back()}
      onCustomActionSelected={({ actionId }) => {
        if (actionId === CC_ACTION_CHANGE_PLAN) router.push('/paywall');
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
