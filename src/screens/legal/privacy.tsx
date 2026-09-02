import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SUPPORT_EMAIL } from '@/constants/config';
import { MaxContentWidth, Spacing } from '@/constants/theme';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Your journeys stay on your device',
    body: 'Flights and trains you track, disruption records, claims, and any photos of boarding passes or receipts are stored in a local database on your device. Signing in is optional — without an account, nothing about your trips leaves your phone.',
  },
  {
    title: 'Accounts and cloud sync',
    body: 'If you sign in (email code, Apple or Google, handled by Clerk), we keep your email address and name for the account, and your journeys — flights, dates and routes, never photos or claim letters — are synced to our cloud database (Convex) so they follow you across devices. Sharing a live trip publishes that flight’s progress to anyone with the link while the trip lasts. Deleting your account removes all of it, in Settings or at getflyright.com/delete-account.',
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
    title: 'Analytics',
    body: 'FlyRight uses Layers to count installs, screens and purchases, so we can see what works and which links or campaigns bring travellers to the app. Events carry a random install id — and your account id once you sign in — never your flights, claims or photos. On iOS the advertising identifier is used only if you allow tracking when asked; change your mind any time under Settings → Privacy & Security → Tracking.',
  },
  {
    title: 'What we don’t do',
    body: 'No ads, no data brokers, no sale of personal data. Your travel history is never shared with anyone.',
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
          FlyRight — effective 2 September 2026
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
