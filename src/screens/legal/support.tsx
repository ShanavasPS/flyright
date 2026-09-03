import { Link } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SUPPORT_EMAIL } from '@/constants/config';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export function Support() {
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title" themeColor="heading">
          Support
        </ThemedText>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Get help</ThemedText>
          <ThemedText type="small">
            Email us — include your flight number and the day it flew if your question
            is about a verdict or claim.
          </ThemedText>
          {/* A scheme href: expo-router hands it to the OS mail client on native
            and renders a plain mailto anchor on web. */}
          <Link href={`mailto:${SUPPORT_EMAIL}`}>
            <ThemedText type="link">{SUPPORT_EMAIL}</ThemedText>
          </Link>
        </ThemedView>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Subscriptions</ThemedText>
          <ThemedText type="small">
            Manage or cancel your plan from Settings → Manage subscription inside the
            app, or through your App Store / Google Play account settings.
          </ThemedText>
        </ThemedView>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">What FlyRight does</ThemedText>
          <ThemedText type="small">
            FlyRight watches your flights and trains, tells you when a disruption makes you
            eligible for compensation under EU261, UK261, or EU rail passenger rights,
            and helps you claim it — keeping 0% of your payout.
          </ThemedText>
        </ThemedView>
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
