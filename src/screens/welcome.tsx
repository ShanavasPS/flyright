import { ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { STORE_URLS } from '@/constants/store-links';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Post-purchase landing: the Web Purchase Link redirects here after checkout.
 * The purchase is already on the buyer's RevenueCat customer (Clerk id), so the
 * only job left is getting the app installed and signed in. */

const STEPS = [
  { title: 'Get the app', detail: 'FlyRight for iPhone or Android, free to install.' },
  { title: 'Sign in', detail: 'Use the same account you just checked out with.' },
  { title: 'Done', detail: 'Pro is already on your account — no restore, no codes.' },
] as const;

export function Welcome() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.page}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <View style={styles.hero}>
            <ThemedText type="display" style={{ color: theme.success }}>
              You&apos;re Pro ✓
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              Thanks for backing your own passenger rights. Two minutes to lift-off:
            </ThemedText>
          </View>

          <Card>
            {STEPS.map(({ title, detail }, index) => (
              <View key={title} style={styles.step}>
                <ThemedText type="smallBold" themeColor="tint">
                  {index + 1}
                </ThemedText>
                <View style={styles.stepBody}>
                  <ThemedText type="smallBold">{title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {detail}
                  </ThemedText>
                </View>
              </View>
            ))}
            <View style={styles.storeRow}>
              <ExternalLink href={STORE_URLS.ios}>
                <ThemedText type="link">Download on the App Store →</ThemedText>
              </ExternalLink>
              <ExternalLink href={STORE_URLS.android}>
                <ThemedText type="link">Get it on Google Play →</ThemedText>
              </ExternalLink>
            </View>
          </Card>

          <ThemedText type="small" themeColor="textSecondary">
            Questions or a receipt you can&apos;t find? Your subscription lives under
            Settings → Manage subscription in the app.
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  scroll: {
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.four,
  },
  hero: {
    gap: Spacing.two,
  },
  step: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  stepBody: {
    flex: 1,
    gap: Spacing.half,
  },
  storeRow: {
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
});
