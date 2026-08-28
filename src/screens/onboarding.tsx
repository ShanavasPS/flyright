import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NotificationPitchArt } from '@/components/notification-pitch';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { reconcileNotifications } from '@/services/notification-lifecycle';
import { requestPushPermission } from '@/services/notifications';
import { markOnboardingSeen, markPushRemindLater } from '@/services/onboarding';

type Page = {
  key: string;
  eyebrow?: string;
  title: string;
  body: string;
  /** Omitted on the welcome page — it shows the animated brand icon instead. */
  icon?: ComponentProps<typeof SymbolView>['name'];
  /** The push-priming page: mock notification art, and the primary button
   * fires the one-shot OS permission prompt instead of paging forward. */
  kind?: 'push';
};

// Travel buddy first, claims second — the pages sell the journal before the
// money, mirroring how the tabs are ordered. The push pitch closes the show:
// it carries the claim story too (delay alerts AND deadline reminders), so
// the ask lands right after the €600 page has established the stakes.
/** Readable column for the intro copy and CTA on tablet-width screens —
 * tighter than MaxContentWidth because these are single short paragraphs. */
const PageMaxWidth = 480;

const PAGES: Page[] = [
  {
    key: 'journal',
    eyebrow: 'Welcome to FlyRight',
    title: 'Every flight, remembered',
    body:
      'Log any trip — next week’s or years back. Distance, countries, airlines: ' +
      'your travel story adds up in one place.',
  },
  {
    key: 'rights',
    title: 'Delayed 3+ hours? That’s money',
    body:
      'EU and UK rules owe you up to €600 for long delays and cancellations. ' +
      'FlyRight checks every flight you track and gives you the verdict.',
    icon: { ios: 'clock.badge.exclamationmark', android: 'schedule', web: 'schedule' },
  },
  {
    key: 'push',
    kind: 'push',
    title: 'Never miss money you’re owed',
    body:
      'Most passengers never claim — they simply never find out. Get an alert ' +
      'the moment a delay is worth money, and reminders before a claim ' +
      'deadline slips away.',
  },
];

export function Onboarding() {
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Page>>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const isPush = PAGES[page].kind === 'push';

  // Seen the moment it appears: every exit path (Skip, Android back, the CTAs)
  // counts, so the intro can never show twice.
  useEffect(() => {
    markOnboardingSeen();
  }, []);

  /** Dismiss to the journeys tab — every path out of the intro ends here. */
  function finish() {
    router.back();
  }

  function advance() {
    const next = page + 1;
    // Optimistic: Android's scrollToIndex doesn't always fire
    // onMomentumScrollEnd, so the dots would lag a swipe behind.
    setPage(next);
    listRef.current?.scrollToIndex({ index: next, animated: true });
  }

  /** The priming page's whole point: the OS permission alert fires only from
   * this explicit tap, after the pitch. Finishes whatever the user decides —
   * a denial still closes, and add-flight's later request is a no-op once
   * the one-shot prompt is spent. */
  async function enablePush() {
    setBusy(true);
    try {
      await requestPushPermission();
      // If they granted, anything the journal already implies gets scheduled.
      await reconcileNotifications();
    } finally {
      setBusy(false);
      finish();
    }
  }

  /** "Remind me later" is a promise, not a dodge: the flag makes the journeys
   * screen re-open the pitch (as a sheet) on a later session, while the
   * one-shot OS prompt is still unspent. */
  function remindLater() {
    markPushRemindLater();
    finish();
  }

  // Explicit insets, not SafeAreaView: inside a fullScreenModal the native
  // SafeAreaView can resolve its top inset as 0 on iOS, pushing Skip into the
  // status bar. The floor keeps sensible padding on inset-less screens.
  const insets = useSafeAreaInsets();

  // Paging offsets are multiples of the window width, so an iPad rotation or
  // window resize strands the list between pages — snap back to the current
  // page whenever the width changes.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: page * width, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.safeArea,
          {
            paddingTop: Math.max(insets.top, Spacing.three),
            paddingBottom: Math.max(insets.bottom, Spacing.three),
          },
        ]}>
        <View style={styles.skipRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => finish()}
            disabled={isPush}
            style={isPush && styles.hidden}>
            <ThemedText type="link">Skip</ThemedText>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={PAGES}
          keyExtractor={(p) => p.key}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onMomentumScrollEnd={(e) =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / width))
          }
          renderItem={({ item }) => (
            <View style={[styles.page, { width }]}>
              {/* Inner clamp: pages span the whole window, but the art and
                  copy hold a readable column on iPad-width screens. */}
              <View style={styles.pageContent}>
              <View style={styles.art}>
                {item.kind === 'push' ? (
                  <NotificationPitchArt />
                ) : item.icon ? (
                  <View
                    style={[styles.iconCircle, { backgroundColor: theme.backgroundSelected }]}>
                    <SymbolView name={item.icon} size={56} tintColor={theme.tint} />
                  </View>
                ) : (
                  // The app-icon tile keeps its splash navy in both themes —
                  // it's the brand mark, not a themed surface.
                  <View style={styles.brandTile}>
                    <Image
                      style={styles.brandImage}
                      source={require('@/assets/images/splash-icon.png')}
                    />
                  </View>
                )}
              </View>
              {item.eyebrow && (
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
                  {item.eyebrow}
                </ThemedText>
              )}
              <ThemedText type="subtitle" themeColor="heading" style={styles.title}>
                {item.title}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.body}>
                {item.body}
              </ThemedText>
              </View>
            </View>
          )}
        />

        <View style={styles.footer}>
          <View style={styles.dots}>
            {PAGES.map((p, i) => (
              <View
                key={p.key}
                style={[
                  styles.dot,
                  i === page && styles.dotActive,
                  { backgroundColor: i === page ? theme.tint : theme.backgroundSelected },
                ]}
              />
            ))}
          </View>
          <PrimaryButton
            label={isPush ? 'Allow notifications' : 'Continue'}
            disabled={busy}
            onPress={() => (isPush ? void enablePush() : advance())}
          />
          {/* One reserved slot on every page so the button row never jumps:
              the priming page's "Remind me later", an invisible placeholder
              elsewhere. */}
          <Pressable
            accessibilityRole="button"
            onPress={remindLater}
            disabled={!isPush || busy}
            style={!isPush && styles.hidden}>
            <ThemedText type="link" style={styles.footerLink}>
              Remind me later
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  skipRow: {
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  hidden: {
    opacity: 0,
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
  },
  pageContent: {
    width: '100%',
    maxWidth: PageMaxWidth,
    alignItems: 'center',
    gap: Spacing.two,
  },
  art: {
    // A floor, not a fixed height: the push page's two-banner stack runs
    // taller than the 128pt icon circles.
    minHeight: 160,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.four,
  },
  iconCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTile: {
    width: 128,
    height: 128,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0C1B36',
  },
  brandImage: {
    width: 76,
    height: 76,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
  },
  footer: {
    width: '100%',
    maxWidth: PageMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 20,
  },
  footerLink: {
    textAlign: 'center',
  },
});
