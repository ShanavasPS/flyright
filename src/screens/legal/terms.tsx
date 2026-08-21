import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SUPPORT_EMAIL } from '@/constants/config';
import { MaxContentWidth, Spacing } from '@/constants/theme';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What FlyRight is',
    body: 'FlyRight is a travel journal and passenger-rights assistant. It tracks your flights, estimates compensation eligibility under regulations like EU261 and UK261, and generates claim documents for you to send to the carrier yourself. FlyRight is not a law firm, does not provide legal advice, and does not represent you against airlines.',
  },
  {
    title: 'No guarantee of compensation',
    body: 'Eligibility verdicts are estimates based on public flight data and the rules as we understand them. The airline makes the final decision, and data providers can be wrong about delays or routes. FlyRight takes no commission — whatever you recover is yours — but we cannot promise a claim will succeed.',
  },
  {
    title: 'Subscriptions and purchases',
    body: 'FlyRight Pro is sold as a monthly or yearly subscription or a one-time lifetime purchase. Purchases made in the apps are billed by Apple or Google under their terms; purchases made on getflyright.com are processed by Stripe and managed by RevenueCat. Subscriptions renew automatically until cancelled, and you can cancel anytime — access continues to the end of the paid period.',
  },
  {
    title: 'Refunds',
    body: 'App-store purchases follow Apple’s and Google’s refund policies, and the app includes a refund-request flow on iOS. For web purchases, EU/UK customers have a 14-day right of withdrawal; contact us and we will sort it out.',
  },
  {
    title: 'Your responsibilities',
    body: 'Enter accurate flight and claim details, and only submit claims for journeys you actually took. You are responsible for the claims you send — FlyRight prepares the paperwork, but you remain the claimant.',
  },
  {
    title: 'Liability',
    body: 'FlyRight is provided “as is”. To the maximum extent permitted by law, we are not liable for missed claim deadlines, rejected claims, or losses arising from inaccurate flight data. Nothing in these terms limits liability that cannot be limited by law, and nothing affects your statutory consumer rights.',
  },
  {
    title: 'Changes',
    body: 'We may update these terms as the product evolves; material changes will be announced in the app. Continuing to use FlyRight after a change means you accept the updated terms.',
  },
  {
    title: 'Contact',
    body: `Questions about these terms: ${SUPPORT_EMAIL}.`,
  },
];

export function Terms() {
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title" themeColor="heading">
          Terms of Service
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          FlyRight — effective 21 August 2026
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
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
});
