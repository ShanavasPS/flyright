import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { reconcileNotifications } from '@/services/notification-lifecycle';
import { requestPushPermission } from '@/services/notifications';
import { markOnboardingSeen } from '@/services/onboarding';

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
// money, mirroring how the tabs are ordered.
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
      'A heads-up before every trip, an alert the moment a delay reaches ' +
      'compensation territory, and deadline reminders on claims you’ve sent.',
  },
  {
    key: 'claim',
    title: 'Claim it in minutes',
    body:
      'Turn an eligible flight into a ready-to-send claim, then track the ' +
      'airline’s response deadline so nothing slips.',
    icon: { ios: 'paperplane.fill', android: 'send', web: 'send' },
  },
];

export function Onboarding() {
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Page>>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const last = page === PAGES.length - 1;
  const isPush = PAGES[page].kind === 'push';

  // Seen the moment it appears: every exit path (Skip, Android back, the CTAs)
  // counts, so the intro can never show twice.
  useEffect(() => {
    markOnboardingSeen();
  }, []);

  /** Dismiss to the journeys tab, then open the follow-up screen only after
   * the modal's exit animation has released the presentation slot — pushing a
   * sheet while the fullScreenModal is still animating out drops it. */
  function finish(then?: '/add-flight' | '/journey/demo') {
    router.back();
    if (then) setTimeout(() => router.push(then), 450);
  }

  function advance() {
    const next = page + 1;
    // Optimistic: Android's scrollToIndex doesn't always fire
    // onMomentumScrollEnd, so the dots would lag a swipe behind.
    setPage(next);
    listRef.current?.scrollToIndex({ index: next, animated: true });
  }

  /** The priming page's whole point: the OS permission alert fires only from
   * this explicit tap, after the pitch. Advances whatever the user decides —
   * a denial still moves on, and add-flight's later request is a no-op once
   * the one-shot prompt is spent. */
  async function enablePush() {
    setBusy(true);
    try {
      await requestPushPermission();
      // If they granted, anything the journal already implies gets scheduled.
      await reconcileNotifications();
    } finally {
      setBusy(false);
      advance();
    }
  }

  // Explicit insets, not SafeAreaView: inside a fullScreenModal the native
  // SafeAreaView can resolve its top inset as 0 on iOS, pushing Skip into the
  // status bar. The floor keeps sensible padding on inset-less screens.
  const insets = useSafeAreaInsets();

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
            disabled={last}
            style={last && styles.hidden}>
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
              <View style={styles.art}>
                {item.kind === 'push' ? (
                  <MockNotification />
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
            label={last ? 'Add your first flight' : isPush ? 'Turn on notifications' : 'Continue'}
            disabled={busy}
            onPress={() => {
              if (last) return finish('/add-flight');
              if (isPush) return void enablePush();
              advance();
            }}
          />
          {/* One reserved slot on every page so the button row never jumps:
              the priming page's "Not now", the last page's demo link, an
              invisible placeholder elsewhere. */}
          {isPush ? (
            <Pressable accessibilityRole="button" onPress={advance} disabled={busy}>
              <ThemedText type="link" style={styles.demoLink}>
                Not now
              </ThemedText>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="link"
              onPress={() => finish('/journey/demo')}
              disabled={!last}
              style={!last && styles.hidden}>
              <ThemedText type="link" style={styles.demoLink}>
                See a demo verdict →
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    </ThemedView>
  );
}

/** The priming page's hero: the exact delay alert the lifecycle sends,
 * rendered as a mock push banner (the Expedia/Vrbo/Flighty pattern) — showing
 * the money moment beats describing it. */
function MockNotification() {
  return (
    <ThemedView type="backgroundElement" style={styles.mockCard}>
      <View style={styles.mockHeader}>
        <View style={styles.mockAppIcon}>
          <Image
            style={styles.mockAppImage}
            source={require('@/assets/images/splash-icon.png')}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.mockAppName}>
          FlyRight
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          now
        </ThemedText>
      </View>
      <ThemedText type="smallBold">AY1331 delayed — you’re likely owed €400</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Running 3h 15m late. EU261 compensation applies — start your claim.
      </ThemedText>
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
    gap: Spacing.two,
  },
  art: {
    height: 160,
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
  mockCard: {
    alignSelf: 'stretch',
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    shadowColor: '#0B1520',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  mockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  mockAppIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0C1B36',
  },
  mockAppImage: {
    width: 14,
    height: 14,
  },
  mockAppName: {
    flex: 1,
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
  demoLink: {
    textAlign: 'center',
  },
});
