import { useUser } from '@clerk/expo';
import { UserButton } from '@clerk/expo/web';
import { Image } from 'expo-image';
import { Link, usePathname } from 'expo-router';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PRO_PRICE_FROM } from '@/constants/config';
import { STORE_URLS } from '@/constants/store-links';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Persistent header + footer for the web funnel (/check, /go-pro, /welcome).
 *
 * The selling CTA stays inside the verdict cards, where the visitor has just been
 * told what they're owed — that context is what closes the sale. This chrome is
 * for the other visitor: the one who arrived already convinced, or who has no
 * flight number to type, and who otherwise had no route to checkout at all.
 *
 * Column layout, so the footer parks at the bottom of the viewport and the
 * screen's own ScrollView takes the overflow between the two bars. */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <ThemedView style={styles.shell}>
      <SiteHeader />
      <View style={styles.body}>{children}</View>
      <SiteFooter />
    </ThemedView>
  );
}

function SiteHeader() {
  const theme = useTheme();
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useUser();

  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.bar, { borderBottomColor: theme.backgroundSelected }]}>
      <View style={styles.barContent}>
        {/* The row is a View, not the Link itself: expo-router's Link renders a
          Text node, and a flex row of an Image + Text inside one lays out
          unpredictably on react-native-web. The wordmark carries the link. */}
        <View style={styles.brand}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.mark}
            contentFit="contain"
            alt="FlyRight"
          />
          <Link href="/check">
            <ThemedText type="smallBold" themeColor="heading">
              FlyRight
            </ThemedText>
          </Link>
        </View>

        <View style={styles.actions}>
          {/* Hidden on the checkout step (a second door to it is just noise) and
            after checkout, where pointing a fresh buyer back at the paywall reads
            as a billing mistake. The footer link stays either way. */}
          {pathname !== '/go-pro' && pathname !== '/welcome' && (
            <Link href="/go-pro">
              <ThemedText type="link">FlyRight Pro →</ThemedText>
            </Link>
          )}

          {/* The only signed-in signal the web build has — without it a visitor
            who just authenticated has no way to tell that it took. Rendered
            only once Clerk has loaded, so the header doesn't jump. Sign-out
            keeps Clerk's default target of "/", which the router sends to
            /check; afterSignOutUrl is a ClerkProvider-level option in this
            version, and setting it there would also reach native. */}
          {isLoaded && isSignedIn && <UserButton />}
        </View>
      </View>
    </ThemedView>
  );
}

function SiteFooter() {
  const theme = useTheme();

  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.bar, styles.footer, { borderTopColor: theme.backgroundSelected }]}>
      <View style={styles.footerContent}>
        <View style={styles.links}>
          <Link href="/go-pro">
            <ThemedText type="link">FlyRight Pro — {PRO_PRICE_FROM}</ThemedText>
          </Link>
          <ExternalLink href={STORE_URLS.ios}>
            <ThemedText type="link">App Store</ThemedText>
          </ExternalLink>
          <ExternalLink href={STORE_URLS.android}>
            <ThemedText type="link">Google Play</ThemedText>
          </ExternalLink>
          <Link href="/privacy">
            <ThemedText type="link">Privacy</ThemedText>
          </Link>
          <Link href="/terms">
            <ThemedText type="link">Terms</ThemedText>
          </Link>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          FlyRight — EU261 compensation, checked in ten seconds.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  bar: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  mark: {
    width: 24,
    height: 24,
    borderRadius: Spacing.two,
  },
  footer: {
    borderBottomWidth: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.one,
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.four,
  },
});
