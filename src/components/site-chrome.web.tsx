import { useUser } from '@clerk/expo';
import { UserButton } from '@clerk/expo/web';
import { Image } from 'expo-image';
import { Link, usePathname } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SUPPORT_EMAIL } from '@/constants/config';
import { STORE_URLS } from '@/constants/store-links';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { setThemePreference } from '@/services/theme';

/** Persistent header + footer for the website (/, /check, /go-pro, /welcome).
 *
 * The chrome owns the page scroll, and the footer travels at the END of the
 * content rather than pinned to the viewport. Pinning is an app-toolbar
 * pattern, and on a phone it cost the page dearly: header plus a tall footer
 * left the scrolling body ~430pt of a 693pt viewport, so /check's own button
 * was laid out inside the clipped region. flexGrow on the body keeps the
 * footer parked at the bottom whenever the content is short enough.
 *
 * Screens pass plain content — NOT their own ScrollView, which would nest two
 * vertical scrolls. `bare` drops the body's padding and width cap for a page
 * that lays out its own full-bleed sections (the front page). */
export function SiteChrome({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  // The header lifts off the page once it has content scrolling under it.
  const [scrolled, setScrolled] = useState(false);
  return (
    <ThemedView style={styles.shell}>
      <SiteHeader scrolled={scrolled} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        scrollEventThrottle={32}
        onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 8)}>
        <View style={bare ? styles.bodyBare : styles.body}>{children}</View>
        <SiteFooter />
      </ScrollView>
    </ThemedView>
  );
}

/** The header's width, and the front page's: wider than the funnel pages'
 * 800, which stay narrow because a form reads better that way. */
const HEADER_WIDTH = 1120;

/** CSS transitions react-native-web renders (the types do not know them). */
const TRANSITION = {
  transitionProperty: 'background-color, border-color, box-shadow, transform, opacity',
  transitionDuration: '220ms',
  transitionTimingFunction: 'ease-out',
} as unknown as ViewStyle;

function SiteHeader({ scrolled }: { scrolled: boolean }) {
  const theme = useTheme();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const { isLoaded, isSignedIn } = useUser();

  return (
    <ThemedView
      type="backgroundElement"
      style={[
        styles.bar,
        TRANSITION,
        { borderBottomColor: scrolled ? theme.hairline : 'transparent' },
        { boxShadow: scrolled ? '0 6px 20px rgba(11, 20, 36, 0.10)' : '0 0 0 rgba(11, 20, 36, 0)' },
      ]}>
      <View style={styles.barContent}>
        {/* The row is a View, not one Link around both: expo-router's Link
          renders a Text node, and a flex row of an Image + Text inside one
          lays out unpredictably on react-native-web. So the mark and the
          wordmark each carry their own link home. */}
        <View style={styles.brand}>
          <Link href="/" style={styles.markLink}>
            <Image source={require('@/assets/images/icon.png')} style={styles.mark} contentFit="contain" alt="FlyRight" />
          </Link>
          <Link href="/">
            <ThemedText type="smallBold" themeColor="heading" style={styles.wordmark}>
              FlyRight
            </ThemedText>
          </Link>
        </View>

        {!compact && (
          <View style={styles.nav}>
            <Link href="/check">
              <ThemedText type="smallBold" themeColor={pathname === '/check' ? 'heading' : 'textSecondary'}>
                Check a flight
              </ThemedText>
            </Link>
            <Link href="/go-pro">
              <ThemedText type="smallBold" themeColor={pathname === '/go-pro' ? 'heading' : 'textSecondary'}>
                Pro
              </ThemedText>
            </Link>
            <Link href="/support">
              <ThemedText type="smallBold" themeColor={pathname === '/support' ? 'heading' : 'textSecondary'}>
                Support
              </ThemedText>
            </Link>
          </View>
        )}

        <View style={styles.right}>
          <ThemeToggle />
          {/* The account slot: the only signed-in signal the web build has.
            Both states render only once Clerk has loaded, so the header
            doesn't jump, and neither shows on /sign-in itself. */}
          {isLoaded &&
            (isSignedIn ? (
              <UserButton />
            ) : (
              pathname !== '/sign-in' &&
              !compact && (
                <Link href="/sign-in">
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Sign in
                  </ThemedText>
                </Link>
              )
            ))}
          {/* Flattened: a child of Link asChild may not receive a style array. */}
          <ExternalLink href={storeForVisitor()} asChild>
            <Pressable accessibilityRole="link" style={StyleSheet.flatten([styles.getApp, { backgroundColor: theme.tint }])}>
              <ThemedText type="smallBold" style={styles.getAppLabel}>
                Get the app
              </ThemedText>
            </Pressable>
          </ExternalLink>
        </View>
      </View>
    </ThemedView>
  );
}

/** One switch, light ↔ dark. The site opens light (services/theme.web); the
 * choice is remembered for the next visit. */
function ThemeToggle() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      testID="theme-toggle"
      onPress={() => setThemePreference(dark ? 'light' : 'dark')}
      style={({ hovered, pressed }) => [
        styles.toggle,
        TRANSITION,
        {
          backgroundColor: theme.backgroundSelected,
          transform: [{ scale: pressed ? 0.94 : hovered ? 1.06 : 1 }, { rotate: dark ? '0deg' : '-15deg' }],
        },
      ]}>
      <SymbolView
        name={dark ? { ios: 'sun.max.fill', android: 'light_mode', web: 'light_mode' } : { ios: 'moon.fill', android: 'dark_mode', web: 'dark_mode' }}
        size={16}
        weight="semibold"
        tintColor={theme.heading}
      />
    </Pressable>
  );
}

/** The store the visitor's device can install from; the App Store when it
 * cannot be told (a desktop), since that page also lists the Play link. */
function storeForVisitor(): (typeof STORE_URLS)[keyof typeof STORE_URLS] {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return /Android/i.test(ua) ? STORE_URLS.android : STORE_URLS.ios;
}

/** Official store badges, linked. Shared by the front page and the footer. */
export function StoreBadges() {
  return (
    <View style={styles.badges}>
      <ExternalLink href={STORE_URLS.ios} style={styles.badgeLink}>
        <Image source={require('@/assets/images/badge-app-store.png')} style={styles.badgeIos} contentFit="contain" alt="Download on the App Store" />
      </ExternalLink>
      <ExternalLink href={STORE_URLS.android} style={styles.badgeLink}>
        <Image source={require('@/assets/images/badge-google-play.png')} style={styles.badgePlay} contentFit="contain" alt="Get it on Google Play" />
      </ExternalLink>
    </View>
  );
}

function SiteFooter() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 720;

  return (
    <ThemedView type="backgroundElement" style={[styles.bar, styles.footer, { borderTopColor: theme.hairline }]}>
      <View style={[styles.footerContent, compact && styles.footerStack]}>
        <View style={styles.footerBrand}>
          <View style={styles.brand}>
            <Image source={require('@/assets/images/icon.png')} style={styles.mark} contentFit="contain" alt="" />
            <ThemedText type="smallBold" themeColor="heading">
              FlyRight
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Your travel day, live — and your advocate when the flight goes wrong.
          </ThemedText>
          <StoreBadges />
        </View>
        <View style={styles.footerLinks}>
          <Link href="/check">
            <ThemedText type="small" themeColor="textSecondary">Check a flight</ThemedText>
          </Link>
          <Link href="/go-pro">
            <ThemedText type="small" themeColor="textSecondary">FlyRight Pro</ThemedText>
          </Link>
          <Link href="/support">
            <ThemedText type="small" themeColor="textSecondary">Support</ThemedText>
          </Link>
          <Link href={`mailto:${SUPPORT_EMAIL}`}>
            <ThemedText type="small" themeColor="textSecondary">{SUPPORT_EMAIL}</ThemedText>
          </Link>
        </View>
        <View style={styles.footerLinks}>
          <Link href="/privacy">
            <ThemedText type="small" themeColor="textSecondary">Privacy</ThemedText>
          </Link>
          <Link href="/terms">
            <ThemedText type="small" themeColor="textSecondary">Terms</ThemedText>
          </Link>
          <ThemedText type="small" themeColor="textSecondary">
            EU261 / UK261 verdicts are guidance, not legal advice. FlyRight is not a law firm — it
            writes the claim, the airline pays you directly.
          </ThemedText>
        </View>
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
    width: '100%',
    maxWidth: MaxContentWidth + Spacing.four * 2,
    alignSelf: 'center',
  },
  bodyBare: {
    flexGrow: 1,
  },
  bar: {
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barContent: {
    width: '100%',
    maxWidth: HEADER_WIDTH,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    minHeight: 44,
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
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  wordmark: {
    fontSize: 17,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  toggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  getApp: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  getAppLabel: {
    color: '#FFFFFF',
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  badgeLink: {
    display: 'flex',
  },
  badgeIos: {
    width: 132,
    height: 44,
  },
  badgePlay: {
    width: 148,
    height: 44,
  },
  footer: {
    borderBottomWidth: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.five,
  },
  footerContent: {
    width: '100%',
    maxWidth: HEADER_WIDTH,
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.five,
  },
  footerStack: {
    flexDirection: 'column',
    gap: Spacing.four,
  },
  footerBrand: {
    flex: 1.4,
    gap: Spacing.three,
    maxWidth: 380,
  },
  footerLinks: {
    flex: 1,
    gap: Spacing.two,
    maxWidth: 320,
  },
});
