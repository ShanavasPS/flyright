import { usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/** Screens the bar steps aside for. Deliberately a short list, not "anything
 * pushed": Apple's guidance is to keep a tab bar up while people move around
 * an app, and one tap to another tab is worth more than the strip of pixels
 * it costs. A full-bleed map is the exception it was written for — the map
 * runs under the bar, the screen already carries its own back button, and
 * there is nothing on it the bar helps with. */
const IMMERSIVE = /^\/person\/[^/]+\/world$/;

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const pathname = usePathname();

  return (
    <NativeTabs
      hidden={IMMERSIVE.test(pathname)}
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

      <NativeTabs.Trigger name="world">
        <NativeTabs.Trigger.Label>World</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/world.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(people)">
        <NativeTabs.Trigger.Label>People</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/people.png')}
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
