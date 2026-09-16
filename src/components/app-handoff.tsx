import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { DETOUR_LINK_BASE } from '@/constants/config';
import { Spacing } from '@/constants/theme';
import { trackEvent } from '@/services/analytics';
import { appLink, storeLink } from '@/services/deferred-links';

/** Which landing sent this visitor to a store, remembered so their return
 * visit leads with the app instead of the two buttons they already used.
 * Per path: a phone that installed for a trip link shouldn't claim to be
 * holding someone's invitation. */
const SENT_TO_STORE_KEY = 'flyright:sent-to-store';

function read(path: string): boolean {
  try {
    return window.localStorage.getItem(SENT_TO_STORE_KEY) === path;
  } catch {
    // Private mode, or storage the browser refuses. The default state is the
    // honest one anyway — it just costs the visitor one extra tap.
    return false;
  }
}

function remember(path: string): void {
  try {
    window.localStorage.setItem(SENT_TO_STORE_KEY, path);
  } catch {
    /* see read() */
  }
}

/** Some in-app browsers (the one inside a messaging app, most often) never
 * implement window.open and drop the call on the floor — which is how a live
 * store button turns into nothing at all. Fall back to navigating this tab;
 * the store opens as an app and the page is still behind it. */
function openExternal(url: string): void {
  let opened: Window | null = null;
  try {
    opened = window.open(url, '_blank');
  } catch {
    opened = null;
  }
  if (!opened) window.location.assign(url);
}

type Props = {
  /** The landing's own in-app path — `/i/<token>` or `/t/<token>`. */
  path: string;
  title: string;
  blurb: string;
  /** "Open the invitation" / "Open this trip". */
  openLabel: string;
};

/**
 * The web landing's bridge into the app, for every way a visitor can arrive.
 *
 * The one thing this cannot rely on is the deferred link. Detour matches an
 * iOS install to a click by fingerprint — same IP, same device, inside 15
 * minutes — and the miss is silent: the app opens on an empty journal and the
 * invitation the visitor came for is nowhere, which is exactly what happened
 * to the invite sent on 2026-09-06 (EAS Observe: a first launch at 02:56 that
 * went to /onboarding and then wandered the People tab, never /i/[token]).
 *
 * So the page offers two paths that don't depend on matching anything:
 *
 * - The app's own scheme. `https://getflyright.com/i/<token>` cannot open the
 *   app from here — iOS suppresses a universal link tapped from a page on the
 *   same domain, and a messaging app's in-app browser never honours one at
 *   all — but `flyright://i/<token>` always does. It's offered plainly rather
 *   than tried automatically: Safari raises an error dialog on a scheme with
 *   nothing behind it, so the visitor decides.
 * - A visitor who has been to a store gets that button promoted to the top on
 *   their way back, which is the moment it is the only thing they need.
 *
 * What this deliberately does NOT do is the iOS Smart App Banner. The page
 * used to append its meta tag from an effect, which Safari never sees — the
 * head is long parsed by then, so the banner has never once appeared — and
 * server-rendering it isn't possible either: /i/[token] is prerendered once
 * as a template and hydrated, so app-argument would have no token in it. The
 * button below does the same job in every browser, in-app ones included.
 */
export function AppHandoff({ path, title, blurb, openLabel }: Props) {
  const [returning, setReturning] = useState(false);
  const inApp = appLink(path);

  // Read after mount, never during render: the server renders the default
  // state and hydration has to match it. `pageshow` is the one that matters —
  // coming back from the store is a bfcache restore, where nothing re-runs.
  useEffect(() => {
    const sync = () => setReturning(read(path));
    sync();
    window.addEventListener('pageshow', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('pageshow', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [path]);

  const toStore = (platform: 'ios' | 'android') => () => {
    remember(path);
    setReturning(true);
    trackEvent('landing_store_tapped', { platform, kind: path.startsWith('/i/') ? 'invite' : 'trip' });
    openExternal(storeLink(platform, path, { base: DETOUR_LINK_BASE, userAgent: navigator.userAgent }));
  };

  const toApp = () => {
    trackEvent('landing_app_opened', { kind: path.startsWith('/i/') ? 'invite' : 'trip' });
    if (inApp) window.location.assign(inApp);
  };

  // Official store badges, side by side — the two taps the page exists for,
  // so they sit where a thumb lands without scrolling.
  const stores = (
    <View style={styles.storeRow}>
      <Pressable onPress={toStore('ios')} accessibilityRole="link" accessibilityLabel="Download on the App Store">
        <Image source={require('../../assets/images/badge-app-store.png')} style={styles.badgeAppStore} />
      </Pressable>
      <Pressable onPress={toStore('android')} accessibilityRole="link" accessibilityLabel="Get it on Google Play">
        <Image source={require('../../assets/images/badge-google-play.png')} style={styles.badgeGooglePlay} />
      </Pressable>
    </View>
  );

  return returning ? (
    <Card style={styles.card}>
      <ThemedText type="smallBold">Installed it? {openLabel}</ThemedText>
      <ThemedText style={styles.blurb} themeColor="textSecondary">
        FlyRight is on this phone now — open it here and it lands straight on this page.
      </ThemedText>
      <PrimaryButton label={openLabel} onPress={toApp} />
      <ThemedText style={styles.blurb} themeColor="textSecondary">
        Still installing? Get it here.
      </ThemedText>
      {stores}
    </Card>
  ) : (
    <Card style={styles.card}>
      <ThemedText type="smallBold" style={styles.centered}>
        {title}
      </ThemedText>
      <ThemedText style={[styles.blurb, styles.centered]} themeColor="textSecondary">
        {blurb}
      </ThemedText>
      {stores}
      <Pressable onPress={toApp} style={styles.alreadyHaveIt}>
        <ThemedText type="link" style={styles.already}>
          Already have FlyRight? {openLabel}
        </ThemedText>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  centered: {
    textAlign: 'center',
  },
  blurb: {
    fontSize: 13,
    lineHeight: 18,
  },
  storeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  // 132 px badges at 40 pt, aspect preserved.
  badgeAppStore: {
    width: 120,
    height: 40,
  },
  badgeGooglePlay: {
    width: 134,
    height: 40,
  },
  alreadyHaveIt: {
    paddingTop: Spacing.half,
  },
  already: {
    fontSize: 13,
    lineHeight: 18,
  },
});
