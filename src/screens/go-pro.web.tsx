import { useUser } from '@clerk/expo';
import { SignIn as ClerkSignIn } from '@clerk/expo/web';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ExternalLink } from '@/components/external-link';
import { PrimaryButton } from '@/components/primary-button';
import { SiteChrome } from '@/components/site-chrome';
import { ThemedText } from '@/components/themed-text';
import { WEB_PURCHASE_LINK } from '@/constants/config';
import { STORE_URLS } from '@/constants/store-links';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { proPriceFrom } from '@/services/web-pricing';

/** Web checkout step: sign in with Clerk, then hand off to the RevenueCat Web
 * Purchase Link keyed by the Clerk user id. Clerk id = RevenueCat app_user_id
 * everywhere, so the purchase is already attached when the same account signs
 * in inside the app — no restore, no code to type. */

const BENEFITS = [
  'Airline-ready claim letters, written for you',
  'Six-week response deadline tracked automatically',
  'Delay alerts the moment a flight starts owing you money',
] as const;

export function GoPro() {
  const { isLoaded, isSignedIn, user } = useUser();

  return (
    <SiteChrome>
      <View style={styles.content}>
        <View style={styles.hero}>
          <ThemedText type="title" themeColor="heading">
            FlyRight Pro
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            One delayed flight pays for years of Pro.
          </ThemedText>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {proPriceFrom(navigator.language)} · annual and lifetime at checkout · cancel anytime
          </ThemedText>
        </View>

        <Card>
          {BENEFITS.map((benefit) => (
            <ThemedText key={benefit} type="small">
              ✓ {benefit}
            </ThemedText>
          ))}
        </Card>

        {!isLoaded ? (
          <Card style={styles.centered}>
            <ActivityIndicator />
          </Card>
        ) : isSignedIn ? (
          <Checkout userId={user.id} email={user.primaryEmailAddress?.emailAddress} />
        ) : (
          <View style={styles.signIn}>
            <ThemedText type="smallBold">
              Sign in first — it&apos;s how your Pro unlocks in the app
            </ThemedText>
            {/* Come back HERE, not to Clerk's default "/" — which the router
              redirects to /check, dropping the buyer back on the funnel's
              first step with no sign of being signed in. Force (not
              fallback) so a stale redirect_url search param can't win, and
              cover the sign-up path too: most buyers arrive without an
              account. */}
            <ClerkSignIn
              forceRedirectUrl="/go-pro"
              signUpForceRedirectUrl="/go-pro"
            />
          </View>
        )}
      </View>
    </SiteChrome>
  );
}

function Checkout({ userId, email }: { userId: string; email?: string }) {
  if (!WEB_PURCHASE_LINK) {
    return (
      <Card>
        <ThemedText type="smallBold">Web checkout is almost ready</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Until then, FlyRight Pro is available inside the app:
        </ThemedText>
        <View style={styles.storeRow}>
          <ExternalLink href={STORE_URLS.ios}>
            <ThemedText type="link">App Store →</ThemedText>
          </ExternalLink>
          <ExternalLink href={STORE_URLS.android}>
            <ThemedText type="link">Google Play →</ThemedText>
          </ExternalLink>
        </View>
      </Card>
    );
  }

  const checkoutUrl = new URL(`${WEB_PURCHASE_LINK}/${encodeURIComponent(userId)}`);
  if (email) checkoutUrl.searchParams.set('email', email);

  return (
    <Card>
      <ThemedText type="small" themeColor="textSecondary">
        Purchasing as {email ?? 'your FlyRight account'} — Pro will be waiting when you
        sign in inside the app.
      </ThemedText>
      {/* Same-tab navigation: RevenueCat redirects back to /welcome after payment. */}
      <PrimaryButton
        label="Continue to secure checkout →"
        onPress={() => window.location.assign(checkoutUrl.toString())}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Payments handled by RevenueCat + Stripe. Cancel anytime.
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.four,
  },
  hero: {
    gap: Spacing.two,
  },
  centered: {
    alignItems: 'center',
  },
  signIn: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  storeRow: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
});
