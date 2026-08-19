import { useRouter } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundSelected}
      iconColor={{ default: colors.textSecondary, selected: colors.tint }}
      labelStyle={{ color: colors.textSecondary, selected: { color: colors.tint } }}
      // The "add" trigger is a button in tab clothing: `disabled` makes the
      // native side swallow the selection (no navigation, no tab desync) while
      // still emitting tabPress, which opens the add-flight sheet instead.
      screenListeners={({ route }) => ({
        tabPress: () => {
          if (route.name === 'add') router.push('/add-flight');
        },
      })}>
      <NativeTabs.Trigger name="(journeys)">
        <NativeTabs.Trigger.Label>My travels</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/journeys.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="claims">
        <NativeTabs.Trigger.Label>Claims</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/claims.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(settings)">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/settings.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      {/* iOS only: the search role renders as the detached circle beside the
          tab bar on iOS 26 — the system placement for a standalone action.
          Android keeps the docked "+" overlay in the journeys screen. */}
      {Platform.OS === 'ios' && (
        <NativeTabs.Trigger name="add" role="search" disabled>
          <NativeTabs.Trigger.Icon sf="plus" />
        </NativeTabs.Trigger>
      )}
    </NativeTabs>
  );
}
