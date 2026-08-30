import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      // iOS 18: UITabBar's scroll-edge appearance is transparent, and with
      // the lists running edge-to-edge the journal showed through the bar
      // mid-scroll. iOS 26's floating glass bar is unaffected by this flag.
      disableTransparentOnScrollEdge
      indicatorColor={colors.backgroundSelected}
      iconColor={{ default: colors.textSecondary, selected: colors.tint }}
      labelStyle={{ color: colors.textSecondary, selected: { color: colors.tint } }}>
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
    </NativeTabs>
  );
}
