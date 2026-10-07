import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BrandArt,
  Contrail,
  HeadsUpArt,
  ON_STAGE,
  PosterArt,
  TravelDayArt,
  UpdatesArt,
  WorldArt,
} from '@/components/onboarding-art';
import { PrimaryButton } from '@/components/primary-button';
import { Spacing } from '@/constants/theme';
import { requestTrackingConsent, trackEvent } from '@/services/analytics';
import { reconcileNotifications } from '@/services/notification-lifecycle';
import { requestPushPermission } from '@/services/notifications';
import { markOnboardingSeen, markPushRemindLater } from '@/services/onboarding';

type Page = {
  key: string;
  /** What the page is about, in a word or two above the title. */
  eyebrow: string;
  /** Two lines at most on an iPhone SE. */
  title: string;
  /** One sentence; the picture carries the rest. */
  body: string;
  /** The page's picture: the app's own surfaces in miniature
   * (components/onboarding-art). */
  art: 'brand' | 'travelDay' | 'updates' | 'world' | 'poster' | 'push';
};

/** Readable column for the copy, pictures and CTA on tablet-width screens —
 * tighter than MaxContentWidth because these are single short paragraphs. */
const PageMaxWidth = 480;

/** Lets the fullScreenModal finish dismissing before the iOS tracking prompt
 * is requested — a system alert asked for mid-transition can be dropped. */
const TRACKING_PROMPT_DELAY_MS = 600;

/** Below this window height (an iPhone SE is 667) the pictures go compact so
 * each page still fits without scrolling. */
const COMPACT_HEIGHT = 740;

// Travel buddy first: the welcome, then the day you fly, the people, the
// globe, the poster, and last the one thing we ask for.
const PAGES: Page[] = [
  {
    key: 'welcome',
    eyebrow: 'Welcome to',
    title: 'Your travel journal, and your buddy on the day you fly.',
    body: 'Every flight, past and to come, with photos, notes and a map. On the day you fly, it stays with you from your front door to arrivals.',
    art: 'brand',
  },
  {
    key: 'travelDay',
    eyebrow: 'Travel day',
    title: 'Your flight, before you unlock.',
    body: 'Countdown, gate, seat and belt, updating by themselves.',
    art: 'travelDay',
  },
  {
    key: 'updates',
    eyebrow: 'Updates',
    title: 'Friends in the air, and their postcards.',
    body: 'They follow your flight live. You send a photo from the trip.',
    art: 'updates',
  },
  {
    key: 'world',
    eyebrow: 'World',
    title: 'Everywhere you’ve been.',
    body: 'Lit by the real sun, city lights after dark, and a plane where you are right now.',
    art: 'world',
  },
  {
    key: 'poster',
    eyebrow: 'Poster',
    title: 'Made to share.',
    body: 'A poster of everywhere you’ve flown, or of one trip. Story or square, night or day.',
    art: 'poster',
  },
  {
    key: 'push',
    eyebrow: 'Heads-up',
    title: 'It tells you before the airline does.',
    body: 'A friend taking off, a friend landing. Nothing else.',
    art: 'push',
  },
];

export function Onboarding() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const compact = height < COMPACT_HEIGHT;
  const listRef = useRef<FlatList<Page>>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const isPush = PAGES[page].art === 'push';
  const isWelcome = page === 0;

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
    // The intro's ground is the brand's navy in both themes — identity, like
    // the splash it follows — so every picture sits on the same night sky.
    <View style={styles.container}>
      <View style={styles.glow} pointerEvents="none" />
      <Contrail />
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
              <View key={p.key} style={[styles.segment, i <= page ? styles.segmentOn : styles.segmentOff]} />
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => finish('skip')}
            disabled={isPush}
            style={isPush && styles.hidden}>
            {/* Quiet on purpose: the page's one loud element is its button. */}
            <Text style={styles.skip}>Skip</Text>
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
              {/* Inner clamp: pages span the whole window, but the copy and
                  pictures hold a readable column on iPad-width screens. */}
              <View style={styles.pageContent}>
                {item.art === 'brand' ? (
                  <WelcomePage page={item} compact={compact} />
                ) : (
                  <>
                    <View style={styles.copy}>
                      <Text style={styles.eyebrow}>{item.eyebrow}</Text>
                      {/* Two lines, always: the titles are written short, and
                          one that still runs long (large text) shrinks a
                          little rather than wrap a third time. */}
                      <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
                        {item.title}
                      </Text>
                      <Text style={styles.body}>{item.body}</Text>
                    </View>
                    <View style={[styles.picture, item.art === 'push' && styles.pictureHigh]}>
                      {item.art === 'travelDay' ? (
                        <TravelDayArt compact={compact} />
                      ) : item.art === 'updates' ? (
                        <UpdatesArt compact={compact} />
                      ) : item.art === 'world' ? (
                        <WorldArt compact={compact} />
                      ) : item.art === 'poster' ? (
                        <PosterArt compact={compact} />
                      ) : (
                        <HeadsUpArt />
                      )}
                    </View>
                  </>
                )}
              </View>
            </ScrollView>
          )}
        />

        <View style={styles.footer}>
          {isWelcome && <Text style={styles.invite}>Let us show you around</Text>}
          {/* The way past the ask without answering it: a promise, not a
              dodge (see remindLater), above the button so the button itself
              stays where Next was on every other page. */}
          {isPush && (
            <Pressable accessibilityRole="button" onPress={remindLater} disabled={busy}>
              <Text style={styles.footerLink}>Remind me later</Text>
            </Pressable>
          )}
          <PrimaryButton
            label={isPush ? 'Allow notifications' : isWelcome ? 'Show me' : 'Next'}
            color={ON_STAGE.tint}
            disabled={busy}
            onPress={() => (isPush ? void enablePush() : advance())}
          />
        </View>
      </View>
    </View>
  );
}

/** The first page: the icon, the name, and what FlyRight is — centred, the
 * one page whose copy sits under its picture. */
function WelcomePage({ page, compact }: { page: Page; compact: boolean }) {
  return (
    <View style={[styles.welcome, compact && styles.welcomeCompact]}>
      <BrandArt compact={compact} />
      <View style={styles.welcomeName}>
        <Text style={[styles.eyebrow, styles.centred]}>{page.eyebrow}</Text>
        <Text style={styles.wordmark}>FlyRight</Text>
      </View>
      <View style={styles.welcomeCopy}>
        <Text style={[styles.welcomeTitle, styles.centred]}>{page.title}</Text>
        <Text style={[styles.body, styles.centred]}>{page.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C1B36',
    experimental_backgroundImage: 'linear-gradient(180deg, #0C1B36 0%, #070F20 100%)',
  },
  // The soft light behind the title, the same on every page.
  glow: {
    position: 'absolute',
    left: -120,
    top: -160,
    width: 520,
    height: 520,
    borderRadius: 260,
    experimental_backgroundImage: 'radial-gradient(circle, rgba(78,155,245,0.22) 0%, rgba(78,155,245,0) 65%)',
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  progress: {
    width: 160,
    flexDirection: 'row',
    gap: Spacing.one,
  },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  segmentOn: {
    backgroundColor: ON_STAGE.text,
  },
  segmentOff: {
    backgroundColor: 'rgba(242,246,251,0.3)',
  },
  skip: {
    color: ON_STAGE.muted,
    fontSize: 14,
    fontWeight: 500,
    // A full-height tap target for a small word.
    lineHeight: 30,
  },
  page: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  pageContent: {
    flex: 1,
    width: '100%',
    maxWidth: PageMaxWidth,
  },
  copy: {
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  eyebrow: {
    color: ON_STAGE.tint,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    color: ON_STAGE.text,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: 700,
  },
  body: {
    color: ON_STAGE.muted,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  picture: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: Spacing.three,
  },
  // The notification stack sits a little above centre, like a stack at the
  // top of a Lock Screen, rather than down by the button.
  pictureHigh: {
    justifyContent: 'flex-start',
    paddingTop: Spacing.six + Spacing.two,
  },
  hidden: {
    opacity: 0,
  },
  footerLink: {
    textAlign: 'center',
    color: ON_STAGE.muted,
    fontSize: 14,
    lineHeight: 30,
    fontWeight: 500,
    marginBottom: Spacing.two,
  },
  welcome: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingBottom: Spacing.four,
  },
  welcomeCompact: {
    gap: Spacing.three,
  },
  welcomeName: {
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
  },
  wordmark: {
    color: ON_STAGE.text,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: 800,
    letterSpacing: -0.5,
  },
  welcomeCopy: {
    gap: Spacing.two + Spacing.half,
    maxWidth: 320,
  },
  welcomeTitle: {
    color: ON_STAGE.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 700,
  },
  centred: {
    textAlign: 'center',
  },
  footer: {
    width: '100%',
    maxWidth: PageMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    // Air under the button, the height a second line would take: the one
    // loud element sits up where the thumb rests, not on the home indicator.
    paddingBottom: Spacing.five + Spacing.one + Spacing.half,
    gap: Spacing.two,
  },
  invite: {
    textAlign: 'center',
    color: '#5A6A7E',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 600,
    marginBottom: Spacing.half,
  },
});
