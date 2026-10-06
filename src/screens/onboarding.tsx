import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NotificationPitchArt } from '@/components/notification-pitch';
import { BrandArt, ClaimArt, Stage, UpdatesArt } from '@/components/onboarding-art';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { requestTrackingConsent, trackEvent } from '@/services/analytics';
import { reconcileNotifications } from '@/services/notification-lifecycle';
import { requestPushPermission } from '@/services/notifications';
import { markOnboardingSeen, markPushRemindLater } from '@/services/onboarding';

type Page = {
  key: string;
  /** What the page is about, in two or three words above the title. */
  eyebrow: string;
  /** One line on an iPhone SE: about 18 characters at this size. */
  title: string;
  /** One sentence; the plan lines below carry the details. */
  body: string;
  /** What the page's promise costs, line by line — free first. Each must
   * match what the app actually locks (services/purchases proLocked), and
   * fit one line on an iPhone SE (about 38 characters). */
  points: { plan: 'Free' | 'Pro'; text: string }[];
  /** The page's picture: the brand icon on the welcome page, else the app's
   * own surfaces in miniature (components/onboarding-art). */
  art: 'brand' | 'updates' | 'claim' | 'push';
};

/** Readable column for the intro copy and CTA on tablet-width screens —
 * tighter than MaxContentWidth because these are single short paragraphs. */
const PageMaxWidth = 480;

/** Lets the fullScreenModal finish dismissing before the iOS tracking prompt
 * is requested — a system alert asked for mid-transition can be dropped. */
const TRACKING_PROMPT_DELAY_MS = 600;

/** Below this window height (an iPhone SE is 667) the art goes compact so
 * each page still fits without scrolling. */
const COMPACT_HEIGHT = 740;

/** Every page's stage is the same height, so the copy under it starts at the
 * same line on every page and nothing jumps as the pages turn. */
const stageHeight = (windowHeight: number, compact: boolean) =>
  compact ? 224 : Math.min(380, Math.max(232, Math.round(windowHeight * 0.4)));

// Travel buddy first: the journal, then the people, then the safety net.
const PAGES: Page[] = [
  {
    key: 'journal',
    eyebrow: 'Welcome to FlyRight',
    title: 'Your travel buddy',
    body: 'Every flight in one place, and a companion from your front door to arrivals.',
    points: [
      { plan: 'Free', text: 'Save every flight, past and upcoming' },
      { plan: 'Free', text: 'Your trips, photos and world map' },
    ],
    art: 'brand',
  },
  {
    key: 'updates',
    eyebrow: 'Updates',
    title: 'Follow your friends',
    body: 'Watch them take off and land as it happens, with the postcards they share on the way.',
    points: [
      { plan: 'Free', text: 'See their take-offs and landings' },
      { plan: 'Pro', text: 'Share postcards from your own trips' },
    ],
    art: 'updates',
  },
  {
    key: 'claims',
    eyebrow: 'Delay compensation',
    title: 'Delayed? Get paid',
    body: 'FlyRight is already watching your flight, so a long delay never goes unnoticed.',
    points: [
      { plan: 'Free', text: 'See what you’re owed, up to €600' },
      { plan: 'Pro', text: 'We prepare the claim for you' },
    ],
    art: 'claim',
  },
  {
    key: 'push',
    eyebrow: 'Notifications',
    title: 'Stay in the loop',
    body: 'Every step of travel day, the moment it happens: yours and your friends’.',
    points: [
      { plan: 'Free', text: 'Your friends’ flights and postcards' },
      { plan: 'Pro', text: 'Gate, boarding and delay alerts' },
    ],
    art: 'push',
  },
];

export function Onboarding() {
  const router = useRouter();
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const compact = height < COMPACT_HEIGHT;
  const listRef = useRef<FlatList<Page>>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const isPush = PAGES[page].art === 'push';

  // Seen the moment it appears: every exit path (Skip, Android back, the CTAs)
  // counts, so the intro can never show twice.
  useEffect(() => {
    markOnboardingSeen();
  }, []);

  /** Dismiss to the journeys tab — every path out of the intro ends here.
   * `exit` records how (analytics), and the iOS tracking prompt follows once
   * the modal is gone: the one permission ask that belongs after the intro
   * rather than inside it. */
  function finish(exit: 'skip' | 'push_allowed' | 'push_later') {
    trackEvent('tutorial_complete', { exit, page });
    router.back();
    void requestTrackingConsent(TRACKING_PROMPT_DELAY_MS);
  }

  function advance() {
    const next = page + 1;
    // Optimistic: Android's scrollToIndex doesn't always fire
    // onMomentumScrollEnd, so the progress bar would lag a swipe behind.
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
      finish('push_allowed');
    }
  }

  /** "Remind me later" is a promise, not a dodge: the flag makes the journeys
   * screen re-open the pitch (as a sheet) on a later session, while the
   * one-shot OS prompt is still unspent. */
  function remindLater() {
    markPushRemindLater();
    finish('push_later');
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
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}>
        {/* Progress on the left, Skip on the right: where the page is, and
            the way out, in one quiet row. */}
        <View style={styles.topBar}>
          <View
            style={styles.progress}
            accessible
            accessibilityLabel={`Page ${page + 1} of ${PAGES.length}`}>
            {PAGES.map((p, i) => (
              <View
                key={p.key}
                style={[
                  styles.segment,
                  { backgroundColor: i <= page ? theme.heading : theme.hairline },
                ]}
              />
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => finish('skip')}
            disabled={isPush}
            style={isPush && styles.hidden}>
            {/* Quiet on purpose: the page's one loud element is its button. */}
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.skip}>
              Skip
            </ThemedText>
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
            // Each page scrolls on its own when it can't fit (large text);
            // otherwise it sits still.
            <ScrollView
              style={{ width }}
              contentContainerStyle={styles.page}
              bounces={false}
              showsVerticalScrollIndicator={false}>
              {/* Inner clamp: pages span the whole window, but the stage and
                  copy hold a readable column on iPad-width screens. */}
              <View style={styles.pageContent}>
                <Stage height={stageHeight(height, compact)} compact={compact} top={item.art === 'push'}>
                  {item.art === 'push' ? (
                    <NotificationPitchArt compact={compact} surface="stage" />
                  ) : item.art === 'updates' ? (
                    <UpdatesArt compact={compact} />
                  ) : item.art === 'claim' ? (
                    <ClaimArt />
                  ) : (
                    <BrandArt />
                  )}
                </Stage>
                <View style={styles.copy}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
                    {item.eyebrow}
                  </ThemedText>
                  {/* One line, always: the titles are written short, and one
                      that still runs long (large text) shrinks a little
                      rather than wrap. */}
                  <ThemedText
                    type="subtitle"
                    themeColor="heading"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={styles.title}>
                    {item.title}
                  </ThemedText>
                  <ThemedText themeColor="textSecondary">{item.body}</ThemedText>
                  <View style={styles.points}>
                    {item.points.map((point) => (
                      <View key={point.text} style={styles.point}>
                        <View style={[styles.plan, { backgroundColor: theme.backgroundSelected }]}>
                          <ThemedText type="smallBold" themeColor="heading" style={styles.planLabel}>
                            {point.plan}
                          </ThemedText>
                        </View>
                        <ThemedText type="small" style={styles.pointText}>
                          {point.text}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </ScrollView>
          )}
        />

        <View style={styles.footer}>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  progress: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.one + Spacing.half,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  skip: {
    // A full-height tap target for a small word.
    lineHeight: 30,
  },
  hidden: {
    opacity: 0,
  },
  page: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  pageContent: {
    width: '100%',
    maxWidth: PageMaxWidth,
  },
  copy: {
    // Inset from the stage's edge to the button's, so copy and button share
    // one left edge.
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    lineHeight: 38,
  },
  points: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - Spacing.one,
  },
  // A neutral tag, not a status: Free and Pro read alike, and the tint
  // stays the button's.
  plan: {
    width: 44,
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.half,
  },
  planLabel: {
    fontSize: 11,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  pointText: {
    flex: 1,
  },
  footer: {
    width: '100%',
    maxWidth: PageMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  footerLink: {
    textAlign: 'center',
  },
});
