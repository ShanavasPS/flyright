import { Slot, usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform, useColorScheme } from 'react-native';

import { useAttention } from '@/components/attention-provider';
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
  /^\/add(?:-[a-z]+)?$/, // adding a flight, step by step — a task, not a place
];

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const pathname = usePathname();
  // Arrivals on the People tab not yet looked at: a new follower, a
  // request, an ask allowed. Clears when the side they're on is opened —
  // the segment inside keeps counting what still needs an answer.
  const { people } = useAttention();

  // The website's front page renders at "/" on web (see (journeys)/index)
  // with its own header. The web tab view has no `hidden` and force-mounts
  // every tab's content, so the site's root skips the tabs altogether and
  // renders just the matched route.
  if (Platform.OS === 'web' && pathname === '/') return <Slot />;

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
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(journeys)">
        <NativeTabs.Trigger.Label>Flights</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/journeys.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(people)">
        <NativeTabs.Trigger.Label>Friends</NativeTabs.Trigger.Label>
        {people > 0 && (
          <NativeTabs.Trigger.Badge>{people > 99 ? '99+' : String(people)}</NativeTabs.Trigger.Badge>
        )}
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/people.png')}
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

      <NativeTabs.Trigger name="claims">
        <NativeTabs.Trigger.Label>Claims</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/claims.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

    </NativeTabs>
  );
}
