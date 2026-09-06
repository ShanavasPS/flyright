import { usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/** Screens the bar steps aside for: a person, a trip, and a map.
 *
 * Not "anything pushed" — Apple's guidance is to keep a tab bar up while
 * people move around an app, and one tap to another tab is worth more than
 * the strip it costs on, say, a settings row or the stats page. These are
 * the screens you arrive at having chosen a subject, where the next move is
 * back to what you were reading rather than sideways into another tab; Alta
 * and corner hide it on somebody's profile for the same reason, and
 * Flighty does on a flight.
 *
 * Anything added here should be a decision, not a drift — which is why it
 * is a list of shapes rather than "does the route have a slash in it". */
const IMMERSIVE = [
  /^\/person\/[^/]+$/, // somebody in your circle
  /^\/person\/[^/]+\/trip\/[^/]+$/, // one of their trips
  /^\/person\/[^/]+\/world$/, // their travel, full bleed
  /^\/trip\/[^/]+$/, // a live trip you follow
  /^\/journey\/[^/]+$/, // one of your own
];

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const pathname = usePathname();

  return (
    <NativeTabs
      hidden={IMMERSIVE.some((route) => route.test(pathname))}
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
