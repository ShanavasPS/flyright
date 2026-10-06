import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useStageCard } from '@/components/onboarding-art';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * What the notifications are for, as they'd land on the lock screen: the
 * traveller's own travel day (boarding, a delay) and their people's
 * postcards. Decorative — the page's copy says which ones are Pro.
 *
 * `surface` is what the banners sit on: the page (the reminder sheet) or the
 * onboarding's navy stage. `compact` (short screens) holds each banner to one
 * line and drops the oldest.
 */
export function NotificationPitchArt({
  compact = false,
  surface = 'page',
}: {
  compact?: boolean;
  surface?: 'page' | 'stage';
}) {
  return (
    <View style={styles.stack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MockBanner
        surface={surface}
        compact={compact}
        when="now"
        title="Boarding at gate B32"
        body="AY1331 to London. Boarding closes at 9:35."
      />
      <MockBanner
        surface={surface}
        compact={compact}
        when="4m ago"
        title="Maja sent a postcard"
        body="Lisbon: “Sunset over the river. Worth the wait.”"
      />
      {/* The oldest banner gives way on a short screen; the copy below
          still names delay alerts. */}
      {!compact && (
        <MockBanner
          surface={surface}
          muted
          when="1h ago"
          title="AY1331 is 45 min late"
          body="Now departs 10:35. We’ll keep watching it."
        />
      )}
    </View>
  );
}

function MockBanner({
  title,
  body,
  when,
  muted,
  compact,
  surface,
}: {
  title: string;
  body: string;
  when: string;
  muted?: boolean;
  compact?: boolean;
  surface: 'page' | 'stage';
}) {
  const dark = useColorScheme() === 'dark';
  const stageCard = useStageCard();
  // The real app icon, as the lock screen shows it: the dark rendition in
  // dark mode, like the home screen.
  const icon = dark
    ? require('@/assets/images/ios-icon-dark.png')
    : require('@/assets/images/icon.png');
  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.card, surface === 'stage' ? stageCard : styles.cardLifted, muted && styles.cardMuted]}>
      <View style={styles.header}>
        <Image style={styles.appIcon} source={icon} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.appName}>
          FlyRight
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {when}
        </ThemedText>
      </View>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={compact ? 1 : undefined}>
        {body}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  stack: {
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  card: {
    alignSelf: 'stretch',
    gap: Spacing.half,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - Spacing.one,
    borderRadius: Spacing.three,
  },
  // On the page the banners float, like a notification over a wallpaper.
  cardLifted: {
    shadowColor: '#0B1520',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  // The older banner sits back like a notification-center stack — present
  // enough to read, quiet enough to keep the fresh alert the hero.
  cardMuted: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  appIcon: {
    width: 20,
    height: 20,
    // The iOS icon mask's corner, about 22.4% of the side.
    borderRadius: 4.5,
  },
  appName: {
    flex: 1,
  },
});
