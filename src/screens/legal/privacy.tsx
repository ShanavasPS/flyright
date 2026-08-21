import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SUPPORT_EMAIL } from '@/constants/config';
import { MaxContentWidth, Spacing } from '@/constants/theme';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Your journeys stay on your device',
    body: 'Flights and trains you track, disruption records, claims, and any photos of boarding passes or receipts are stored in a local database on your device. We do not run user accounts and we do not upload this data to our own servers.',
  },
  {
    title: 'Flight lookups',
    body: 'When you add a flight, the flight number and date are sent to our lookup service, which queries an aviation data provider (AeroDataBox) to fetch the schedule, route, and delay status. These requests are not linked to your identity and are not stored by us.',
  },
  {
    title: 'Purchases',
    body: 'Subscriptions and one-time purchases are processed by Apple App Store, Google Play, or — for purchases made on getflyright.com — Stripe, and managed through RevenueCat. RevenueCat receives an app user id and purchase history so your entitlements work across reinstalls and devices. We never see your payment details. See RevenueCat’s privacy policy at revenuecat.com/privacy.',
  },
  {
    title: 'Notifications',
    body: 'If you enable notifications, a push token is registered with OneSignal so we can alert you about delays and claim deadlines. You can disable notifications at any time in system settings.',
  },
  {
    title: 'Camera',
    body: 'The camera is used only to scan boarding passes and photograph claim evidence. Photos remain on your device.',
  },
  {
    title: 'What we don’t do',
    body: 'No ads, no analytics brokers, no sale of personal data, no tracking across other apps or websites.',
  },
  {
    title: 'Contact',
    body: `Questions or data requests: ${SUPPORT_EMAIL}.`,
  },
];

export function Privacy() {
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title" themeColor="heading">
          Privacy Policy
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          FlyRight — effective 5 August 2026
        </ThemedText>
        {SECTIONS.map(({ title, body }) => (
          <ThemedView key={title} type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{title}</ThemedText>
            <ThemedText type="small">{body}</ThemedText>
          </ThemedView>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
