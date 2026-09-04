import { useUser } from '@clerk/expo';
import { UserButton } from '@clerk/expo/web';
import { Image } from 'expo-image';
import { Link, usePathname } from 'expo-router';
import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SUPPORT_EMAIL } from '@/constants/config';
import { STORE_URLS } from '@/constants/store-links';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Persistent header + footer for the web funnel (/check, /go-pro, /welcome).
 *
 * The selling CTA stays inside the verdict cards, where the visitor has just been
 * told what they're owed — that context is what closes the sale. This chrome is
 * for the other visitor: the one who arrived already convinced, or who has no
 * flight number to type, and who otherwise had no route to checkout at all.
 * That visitor is served by ONE door, in the footer — a second copy in the
 * header only competed with the flight form for the same first glance.
 *
 * The chrome owns the page scroll, and the footer travels at the END of the
 * content rather than pinned to the viewport. Pinning is an app-toolbar
 * pattern, and on a phone it cost the page dearly: header (71pt) plus a
 * three-row footer (~190pt) left the scrolling body ~430pt of a 693pt
 * viewport, so /check's own "Check my compensation" button was laid out
 * inside the clipped region — present, but invisible without discovering an
 * inner scroll. flexGrow on the body keeps the footer parked at the bottom
 * whenever the content is short enough to leave room, which is what the
 * pinned version was really for.
 *
 * Screens therefore pass plain content — NOT their own ScrollView, which
 * would nest two vertical scrolls. */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <ThemedView style={styles.shell}>
      <SiteHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.body}>{children}</View>
        <SiteFooter />
      </ScrollView>
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
        {/* The row is a View, not one Link around both: expo-router's Link
          renders a Text node, and a flex row of an Image + Text inside one
          lays out unpredictably on react-native-web. So the mark and the
          wordmark each carry their own link home — visitors aim at the logo
          as often as the name, and half a hit area reads as a dead one. */}
        <View style={styles.brand}>
          {/* display:flex on the link is load-bearing: Link renders a Text, so
            the anchor gets a ~38pt line box and the 24pt mark baseline-aligns
            to its BOTTOM, landing 7pt below the wordmark's centre. As a flex
            container the anchor hugs the image instead. */}
          <Link href="/check" style={styles.markLink}>
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.mark}
              contentFit="contain"
              alt="FlyRight"
            />
          </Link>
          <Link href="/check">
            <ThemedText type="smallBold" themeColor="heading">
              FlyRight
            </ThemedText>
          </Link>
        </View>

        {/* The account slot: the only signed-in signal the web build has —
          without it a visitor who just authenticated has no way to tell that
          it took — and, signed out, the funnel's one door to an account for
          the visitor who already bought Pro elsewhere and just needs to get
          back into it. Both render only once Clerk has loaded, so the header
          doesn't jump, and neither shows on /sign-in itself. Sign-out keeps
          Clerk's default target of "/", which the router sends to /check;
          afterSignOutUrl is a ClerkProvider-level option in this version, and
          setting it there would also reach native. */}
        {isLoaded &&
          (isSignedIn ? (
            <UserButton />
          ) : (
            pathname !== '/sign-in' && (
              <Link href="/sign-in">
                <ThemedText type="link">Sign in</ThemedText>
              </Link>
            )
          ))}
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
        {/* Three fixed rows instead of one wrapping row: on a phone the single
          row wrapped wherever it ran out of width, which both split the store
          pair across lines and spread the links by the row gap. Price is left
          off — the paywall states it, and a number here just invites a
          currency mismatch with what checkout actually charges. */}
        <Link href="/go-pro">
          <ThemedText type="link">FlyRight Pro</ThemedText>
        </Link>
        <View style={styles.links}>
          <ExternalLink href={STORE_URLS.ios}>
            <ThemedText type="link">App Store</ThemedText>
          </ExternalLink>
          <ExternalLink href={STORE_URLS.android}>
            <ThemedText type="link">Google Play</ThemedText>
          </ExternalLink>
        </View>
        <View style={styles.links}>
          <Link href="/privacy">
            <ThemedText type="link">Privacy</ThemedText>
          </Link>
          <Link href="/terms">
            <ThemedText type="link">Terms</ThemedText>
          </Link>
          <Link href="/support">
            <ThemedText type="link">Support</ThemedText>
          </Link>
          <Link href={`mailto:${SUPPORT_EMAIL}`}>
            <ThemedText type="link">Contact</ThemedText>
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
  scroll: {
    flexGrow: 1,
  },
  body: {
    flexGrow: 1,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
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
  markLink: {
    display: 'flex',
    alignItems: 'center',
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
    gap: Spacing.two,
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
});
