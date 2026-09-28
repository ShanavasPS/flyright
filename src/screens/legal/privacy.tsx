import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SUPPORT_EMAIL } from '@/constants/config';
import { MaxContentWidth, Spacing } from '@/constants/theme';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Your journeys stay on your device',
    body: 'Flights and trains you track, disruption records, claims, trip photos, and any booking documents you import are stored in a local database and folder on your device. Signing in is optional — without an account, nothing about your trips leaves your phone.',
  },
  {
    title: 'Accounts and cloud sync',
    body: 'If you sign in (email code, Apple or Google, handled by Clerk), we keep your email address and name for the account, and sync to our cloud storage (Convex) so they follow you across devices: your journeys (flights, dates, routes, seat and booking reference), the photos you add to a trip, and — when you leave “Keep the document with the trip” on while importing — the booking PDF or picture itself. Trip photos and documents are private to you; a photo reaches the people who follow you only when you post it as a trip update, and booking documents are never shared. Claim letters stay on your device. Sharing a live trip publishes that flight’s progress to anyone with the link while the trip lasts. Removing a document, photo or trip deletes it from our storage; deleting your account removes all of it, in Settings or at getflyright.com/delete-account.',
  },
  {
    title: 'Flight lookups',
    body: 'When you add a flight, the flight number and date are sent to our lookup service, which queries an aviation data provider (AeroDataBox) to fetch the schedule, route, and delay status. We keep the answer about that flight for up to seven days so the same question is not bought twice — it describes the flight, not you, and is never linked to your identity. The line a flight actually flew, drawn on the trip’s map, comes from a second provider (FlightAware AeroAPI) the same way and is kept for up to thirty days. Contains AeroAPI data © FlightAware LLC.',
  },
  {
    title: 'Purchases',
    body: 'Subscriptions and one-time purchases are processed by Apple App Store, Google Play, or — for purchases made on getflyright.com — Stripe, and managed through RevenueCat. RevenueCat receives an app user id and purchase history so your entitlements work across reinstalls and devices. We never see your payment details. See RevenueCat’s privacy policy at revenuecat.com/privacy.',
  },
  {
    title: 'Notifications',
    body: 'If you enable notifications, a push token is registered with OneSignal so we can alert you about delays and claim deadlines. You can disable notifications at any time in system settings. When you create an account, your verified email address is also shared with OneSignal so we can send you a welcome email and occasional product updates; every email carries an unsubscribe link.',
  },
  {
    title: 'Camera',
    body: 'The camera is used to scan boarding passes, photograph claim evidence and add photos to a trip. Claim evidence stays on your device; trip photos sync as described above when you are signed in.',
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
          FlyRight — effective 28 September 2026
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
