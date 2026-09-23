import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * Notification examples distinguish free family delivery from own Pro alerts.
 */
export function NotificationPitchArt() {
  return (
    <View style={styles.stack}>
      <MockBanner
        when="now"
        title="Alex is flying today"
        body="Helsinki → London. Follow the shared flight in FlyRight."
      />
      <MockBanner
        muted
        when="1h ago"
        title="With Pro: your flight update"
        body="Gate, terminal and delay alerts when the airline makes them available."
      />
    </View>
  );
}

function MockBanner({
  title,
  body,
  when,
  muted,
}: {
  title: string;
  body: string;
  when: string;
  muted?: boolean;
}) {
  return (
    <ThemedView type="backgroundElement" style={[styles.card, muted && styles.cardMuted]}>
      <View style={styles.header}>
        <View style={styles.appIcon}>
          <Image style={styles.appImage} source={require('@/assets/images/splash-icon.png')} />
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.appName}>
          FlyRight
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {when}
        </ThemedText>
      </View>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
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
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
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
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0C1B36',
  },
  appImage: {
    width: 14,
    height: 14,
  },
  appName: {
    flex: 1,
  },
});
