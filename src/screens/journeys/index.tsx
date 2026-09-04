import { useAuth } from '@clerk/expo';
import { useQuery } from 'convex/react';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Link, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';

import { AirlineLogo } from '@/components/airline-logo';
import { MicroLabel, PassAction, PassCard, PassDivider } from '@/components/pass-card';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FollowingSection } from '@/components/following-section';
import { HomeHero } from '@/components/travel-day-banner';
import {
  COBALT,
  MiniContrail,
  WHITE,
  WHITE_DIM,
  WHITE_FAINT,
} from '@/components/travel-stats-header';
import { CONVEX_URL } from '@/constants/config';
import { MaxContentWidth, Spacing, TwoPaneMinWidth } from '@/constants/theme';
import { JourneyDetail } from '@/screens/journey-detail';
import { useTheme } from '@/hooks/use-theme';
import { evaluate } from '@/rules/engine';
import type { Money } from '@/rules/types';
import { requestTrackingConsent } from '@/services/analytics';
import { useClaims, type ClaimRow } from '@/services/claims';
import { countdown, formatDayLabel, formatTime } from '@/services/dates';
import { useDisruptions } from '@/services/disruptions';
import { toDomainJourney, useJourneys, type JourneyRow } from '@/services/journeys';
import { canPromptForPush } from '@/services/notifications';
import {
  clearPushRemind,
  markOnboardingSeen,
  onboardingSeen,
  pushRemindDue,
} from '@/services/onboarding';
import { cityOf, groupJourneys, travelStats } from '@/services/timeline';

import { useFoldState } from '../../../modules/flyright-fold';

const YEAR_MS = 365 * 86_400_000;

/** Ghost trip card in the empty hero: the real row's height (40pt logo +
 * card padding) and how far each card behind it peeks out. */
const GHOST_CARD_HEIGHT = 40 + 2 * Spacing.three;
const GHOST_PEEK = 10;

/** The context line above the title — the next departure when one is booked
 * (the thing a traveller actually wants at a glance), today's date otherwise.
 * Relies on groupJourneys putting the soonest upcoming trip first. */
function headerEyebrow(sections: ReturnType<typeof groupJourneys>, now: Date): string {
  const next = sections[0]?.key === 'upcoming' ? sections[0].data[0] : undefined;
  if (next) {
    const timer = countdown(next.scheduledDeparture, now);
    const route = `${next.fromCode} → ${next.toCode}`;
    // Once it's happening, the trip isn't "next" any more — lead with the moment.
    if (timer.unit === 'now') return `Boarding soon · ${route}`;
    return `Next trip ${timerLabel(timer)} · ${route}`;
  }
  return now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function Journeys() {
  const router = useRouter();
  const { userId } = useAuth();
  const { data: journeys } = useJourneys(userId);
  const { data: claimRows } = useClaims(userId);
  const { data: disruptionRows } = useDisruptions();

  // First launch decides once the journal has loaded: a brand-new user (no
  // rows, intro never shown) gets the onboarding pages; a user whose journal
  // already has entries predates the intro and is waived, not interrupted.
  // The iOS tracking prompt comes after the intro — onboarding itself asks
  // on the way out; everyone else (already introduced or waived) is asked
  // here, which is an instant no-op once the one-shot prompt has been answered.
  const loaded = journeys != null;
  useEffect(() => {
    if (!loaded) return;
    if (onboardingSeen()) {
      void requestTrackingConsent();
      return;
    }
    if (journeys!.length) {
      markOnboardingSeen();
      void requestTrackingConsent();
    } else {
      router.push('/onboarding');
    }
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // The "Remind me later" promise from onboarding's push pitch: one follow-up
  // sheet on a later session (24h+), and only while the one-shot OS prompt is
  // still unspent. The flag is consumed up front either way — granted via
  // add-flight in the meantime means the reminder is moot, not deferred.
  useEffect(() => {
    if (!loaded || !onboardingSeen() || !pushRemindDue()) return;
    clearPushRemind();
    void canPromptForPush().then((can) => {
      if (can) router.push('/notification-prime');
    });
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = new Date();
  const sections = useMemo(() => groupJourneys(journeys ?? [], now), [journeys]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = useMemo(() => travelStats(journeys ?? []), [journeys]);
  const claimByJourney = useMemo(() => {
    const map = new Map<string, ClaimRow>();
    for (const row of claimRows ?? []) map.set(row.claims.journeyId, row.claims);
    return map;
  }, [claimRows]);
  // Cached delays run through the pure rules engine — no network — so rows the
  // app knows are compensation-eligible get a money badge before any claim exists.
  const owedByJourney = useMemo(() => {
    const byId = new Map((journeys ?? []).map((j) => [j.id, j]));
    const map = new Map<string, Money>();
    for (const d of disruptionRows ?? []) {
      if (d.delayMinutes == null) continue;
      const row = byId.get(d.journeyId);
      if (!row) continue;
      const verdict = evaluate(toDomainJourney(row), {
        type: 'delay',
        delayMinutes: d.delayMinutes,
      });
      if (verdict.eligible && verdict.compensation) map.set(row.id, verdict.compensation);
    }
    return map;
  }, [disruptionRows, journeys]);

  // Samsung Flex mode / tabletop: the device is half-open with a horizontal
  // hinge. The live hero moves to the top half (glanceable, like a departures
  // board propped on a table) and the journal list gets the bottom half.
  // `isSeparating` is androidx's own "split content across the fold" signal —
  // it covers half-opened postures plus hinges that always divide the panes,
  // and stays false on a foldable lying fully flat.
  const fold = useFoldState();
  const tabletopHinge =
    fold.orientation === 'horizontal' && (fold.posture === 'halfOpened' || fold.isSeparating)
      ? fold.hingeBounds
      : null;

  // Book posture / big screens: list on the left, the selected trip's detail
  // on the right. Expanded-width windows only (unfolded foldable in
  // landscape, big tablets); on a book-fold the pane seam sits exactly on
  // the hinge. Tabletop wins when both could apply (a fold rotated to a
  // horizontal hinge is a tabletop, not a book).
  const { width: windowWidth } = useWindowDimensions();
  const twoPane = !tabletopHinge && windowWidth >= TwoPaneMinWidth && !!journeys?.length;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const bookHinge =
    fold.orientation === 'vertical' && fold.isSeparating ? fold.hingeBounds : null;
  const listPaneWidth = bookHinge ? bookHinge.left : Math.round(windowWidth * 0.42);
  const detailId = twoPane
    ? journeys!.some((j) => j.id === selectedId)
      ? selectedId
      : (sections[0]?.data[0]?.id ?? null)
    : null;

  const listPane = (
    <>
      {/* Top edge only: the list itself runs under the floating tab bar (the
          iOS 26 behavior — glass blurs the content scrolling beneath it). */}
      <SafeAreaView
        edges={tabletopHinge ? ['left', 'right'] : ['top', 'left', 'right']}
        style={[styles.safeArea, !!tabletopHinge && styles.belowHinge]}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <ThemedText
              type="smallBold"
              themeColor="textSecondary"
              style={styles.eyebrow}
              numberOfLines={1}>
              {headerEyebrow(sections, now)}
            </ThemedText>
            <ThemedText type="title" themeColor="heading">
              My travels
            </ThemedText>
          </View>
          <View style={styles.titleActions}>
            <MessagesButton />
            <AddFlightButton onPress={() => router.push('/add-flight')} />
          </View>
        </View>

        {journeys?.length ? (
          <SectionList
            sections={sections}
            keyExtractor={(row) => row.id}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            // One hero: on travel day the live flight and all-time stats
            // share a single navy card; otherwise the stats card stands alone.
            ListHeaderComponent={
              <>
                {!tabletopHinge && <HomeHero journeys={journeys} stats={stats} />}
                {!!CONVEX_URL && <FollowingSection />}
              </>
            }
            renderSectionHeader={({ section }) => (
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
                {section.title}
              </ThemedText>
            )}
            renderItem={({ item }) => (
              <JourneyItem
                row={item}
                now={now}
                claim={claimByJourney.get(item.id)}
                owed={owedByJourney.get(item.id)}
                onSelect={twoPane ? () => setSelectedId(item.id) : undefined}
                selected={twoPane && detailId === item.id}
              />
            )}
          />
        ) : (
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}>
            <JournalHero onAdd={() => router.push('/add-flight')} />
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );

  return (
    <ThemedView style={styles.container}>
      {tabletopHinge && (
        <View style={[styles.topPane, { height: tabletopHinge.top }]}>
          <SafeAreaView edges={['top', 'left', 'right']} style={styles.topPaneSafe}>
            <HomeHero journeys={journeys ?? []} stats={stats} variant="glance" />
          </SafeAreaView>
        </View>
      )}
      {twoPane ? (
        <View style={styles.panes}>
          <View style={{ width: listPaneWidth }}>{listPane}</View>
          <ThemedView type="backgroundElement" style={styles.paneDivider} />
          <View style={styles.detailPane}>
            {/* Keyed so a new selection restarts the detail's entering
                animations instead of morphing the previous trip's state. */}
            {detailId && <JourneyDetail key={detailId} journeyId={detailId} embedded />}
          </View>
        </View>
      ) : (
        listPane
      )}
    </ThemedView>
  );
}

/** The empty journal's hero: the night-sky card of the travel-day pass with a
 * deck of ghost trip cards where the journal's rows will stack up — the same
 * silhouette as the real rows below (logo, date · flight, cities, times), in
 * skeleton form, no labels. Pure travel-journal pitch; claims live in their
 * own tab. */
function JournalHero({ onAdd }: { onAdd: () => void }) {
  return (
    <PassCard>
      <View style={styles.spacedRow}>
        <MicroLabel>Your travel journal</MicroLabel>
        <MiniContrail />
      </View>
      <GhostTrips />
      <View style={styles.heroCopy}>
        <Text style={styles.heroHeadline}>Where have you flown?</Text>
        <Text style={styles.heroPitch}>
          Next month&apos;s trip or one from years back — distance, countries and airlines add
          up here.
        </Text>
      </View>
      <PassDivider />
      <PassAction
        label="Add your first flight"
        onPress={onAdd}
        icon={{ ios: 'plus', android: 'add', web: 'add' }}
      />
    </PassCard>
  );
}

/** Three ghost trip rows, the back two peeking out above the front one like
 * a deck. Only the front card carries the row's skeleton content; the ones
 * behind are silhouettes, each a step narrower and fainter. Decorative — the
 * headline says what it means. */
function GhostTrips() {
  return (
    <View
      style={styles.ghostDeck}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={[styles.ghostCard, styles.ghostCardBack2]} />
      <View style={[styles.ghostCard, styles.ghostCardBack1]} />
      <View style={[styles.ghostCard, styles.ghostCardFront]}>
        <View style={styles.ghostLogo}>
          <SymbolView
            name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
            size={16}
            tintColor={COBALT}
            style={Platform.OS === 'ios' ? undefined : styles.rotated}
          />
        </View>
        <View style={styles.ghostBody}>
          <View style={styles.spacedRow}>
            <View style={[styles.ghostBar, styles.ghostBarMeta]} />
            <View style={styles.ghostChip} />
          </View>
          <View style={[styles.ghostBar, styles.ghostBarRoute]} />
          <View style={[styles.ghostBar, styles.ghostBarSchedule]} />
        </View>
      </View>
    </View>
  );
}

/** Messages door beside the "+": the same place Settings → Contact support
 * leads (conversations when signed in, the form otherwise), with an unread
 * badge so a support reply is noticed even by travelers who never enabled
 * push. Rendered in the same circle as the add button. */
function MessagesButton() {
  const router = useRouter();
  const theme = useTheme();
  const glass = isLiquidGlassAvailable();
  const { isSignedIn } = useAuth();

  const icon = (
    <SymbolView
      name={{ ios: 'message.fill', android: 'chat', web: 'chat' }}
      size={18}
      weight="semibold"
      tintColor={glass ? theme.tint : '#ffffff'}
    />
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Messages with support"
      testID="home-messages"
      // Cross-tab hand-off, like the World map: navigate (not push) so the
      // settings tab's stack receives the route.
      onPress={() => router.navigate(isSignedIn ? '/messages' : '/contact')}>
      {glass ? (
        <GlassView glassEffectStyle="regular" isInteractive style={styles.addCircle}>
          {icon}
        </GlassView>
      ) : (
        <View style={[styles.addCircle, styles.addFallback, { backgroundColor: theme.tint }]}>
          {icon}
        </View>
      )}
      {!!CONVEX_URL && isSignedIn && (
        <QuietBoundary>
          <UnreadBadge />
        </QuietBoundary>
      )}
    </Pressable>
  );
}

/** A decoration must never take the screen down: Convex query errors throw
 * during render, so the badge renders nothing if its query fails. */
class QuietBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Count of conversations with an unopened support reply. Its own component
 * so the Convex hook only mounts with a provider and a signed-in user. */
function UnreadBadge() {
  const theme = useTheme();
  const count = useQuery(api.support.unreadCount, {});
  if (!count) return null;
  return (
    <View
      style={[styles.badge, { backgroundColor: theme.danger }]}
      accessibilityLabel={`${count} unread`}>
      <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

/** Header-style "+" on the title row's right edge — the standard list-screen
 * add affordance, same placement on every platform. Liquid Glass where the OS
 * supports it; an elevated brand-tint circle everywhere else. */
function AddFlightButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const glass = isLiquidGlassAvailable();

  const icon = (
    <SymbolView
      name={{ ios: 'plus', android: 'add', web: 'add' }}
      size={20}
      weight="semibold"
      tintColor={glass ? theme.tint : '#ffffff'}
    />
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add a flight, past or future"
      onPress={onPress}>
      {glass ? (
        <GlassView glassEffectStyle="regular" isInteractive style={styles.addCircle}>
          {icon}
        </GlassView>
      ) : (
        <View style={[styles.addCircle, styles.addFallback, { backgroundColor: theme.tint }]}>
          {icon}
        </View>
      )}
    </Pressable>
  );
}

/** The codes-and-times detail line, Flighty-style: "HEL 10:15 → LHR 14:20".
 * Journal entries only carry times the user typed: identical noon timestamps
 * are the "no times" placeholder (show distance), identical non-noon ones mean
 * a single entered time — never render a fabricated departure → arrival pair. */
function scheduleLabel(row: JourneyRow): string {
  const { scheduledDeparture: dep, scheduledArrival: arr } = row;
  const km = `${Math.round(row.distanceKm).toLocaleString()} km`;
  if (row.source === 'manual' && dep === arr) {
    return dep.endsWith('T12:00:00')
      ? `${row.fromCode} → ${row.toCode} · ${km}`
      : `${row.fromCode} ${formatTime(dep)} → ${row.toCode} · ${km}`;
  }
  return `${row.fromCode} ${formatTime(dep)} → ${row.toCode} ${formatTime(arr)}`;
}

/** The first non-empty line of a note, for the list row's one-line peek. */
function firstLine(notes: string): string {
  return notes.split('\n').find((line) => line.trim())?.trim() ?? '';
}

/** Money-moment marker on a journey row: a compact pill in the meta line's
 * right slot — amount in payout green on the page background, so it pops off
 * the card surface in both light (porcelain on white) and dark (deep navy on
 * card navy) modes. A claim's lifecycle (draft/sent/overdue) wins over plain
 * eligibility ("owed"). */
function MoneyBadge({ claim, owed, now }: { claim?: ClaimRow; owed?: Money; now: Date }) {
  const theme = useTheme();
  const amount = claim ? `${claim.amount} ${claim.currency}` : `${owed!.amount} ${owed!.currency}`;
  const overdue =
    claim?.status === 'sent' &&
    !!claim.responseDeadline &&
    Date.parse(claim.responseDeadline) < now.getTime();

  const label = !claim
    ? 'owed'
    : claim.status === 'draft'
      ? 'draft'
      : overdue
        ? 'overdue'
        : claim.status;

  return (
    <ThemedView type="background" style={styles.claimBadge}>
      <ThemedText type="smallBold" style={{ color: theme.success }}>
        {amount}
      </ThemedText>
      <ThemedText
        type="small"
        themeColor={overdue ? undefined : 'textSecondary'}
        style={overdue ? { color: theme.danger } : undefined}>
        {label}
      </ThemedText>
    </ThemedView>
  );
}

/** "in 3h" / "26h ago" / "in 5d" / "now" — compact enough to live on the
 * row's right edge without squeezing the flight details. */
function timerLabel(timer: { value: number; unit: string }): string {
  if (timer.unit === 'now') return 'now';
  const short = timer.unit.startsWith('hours') ? 'h' : 'd';
  return timer.unit.endsWith('ago') ? `${timer.value}${short} ago` : `in ${timer.value}${short}`;
}

function JourneyItem({
  row,
  now,
  claim,
  owed,
  onSelect,
  selected,
}: {
  row: JourneyRow;
  now: Date;
  claim?: ClaimRow;
  owed?: Money;
  /** Two-pane mode: select into the detail pane instead of pushing a route. */
  onSelect?: () => void;
  selected?: boolean;
}) {
  const theme = useTheme();
  // Recent and upcoming trips get the live countdown; older ones read like a
  // journal entry — the calendar rail plus the year section header say enough.
  const isOld = now.getTime() - Date.parse(row.scheduledDeparture) > YEAR_MS;
  const timer = countdown(row.scheduledDeparture, now);
  const upcoming = Date.parse(row.scheduledDeparture) >= now.getTime();
  const card = (
      <Pressable
        onPress={onSelect}
        style={({ pressed }) => pressed && styles.rowPressed}>
        <SheenCard
          style={[
            styles.rowCard,
            selected && { borderWidth: 1, borderColor: theme.tint },
          ]}>
          <AirlineLogo number={row.number} carrier={row.carrier} />
          <View style={styles.rowBody}>
            {/* Countdown sits on the meta line's right (Flighty's date slot) so
                the title and schedule lines get the full card width below.
                Date leads so a long carrier name truncates, never the date;
                the year lives in the section headers. */}
            <View style={styles.metaRow}>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                numberOfLines={1}
                style={styles.metaCarrier}>
                {/* The logo already names the airline, so the flight number
                    alone follows the date (Flighty's pattern); carrier is the
                    fallback for number-less journal entries. */}
                {formatDayLabel(row.scheduledDeparture)} · {row.number || row.carrier}
              </ThemedText>
              {/* One right slot: the money moment outranks the countdown. */}
              {claim || owed ? (
                <MoneyBadge claim={claim} owed={owed} now={now} />
              ) : (
                !isOld && (
                  <ThemedText
                    type={upcoming ? 'smallBold' : 'small'}
                    themeColor={upcoming ? 'heading' : 'textSecondary'}>
                    {timerLabel(timer)}
                  </ThemedText>
                )
              )}
            </View>
            <ThemedText
              type="smallBold"
              themeColor="heading"
              style={styles.route}
              numberOfLines={1}>
              {cityOf(row.fromCode)} to {cityOf(row.toCode)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {scheduleLabel(row)}
            </ThemedText>
            {/* The journal peeks through: the note's first line, so the list
                reads as a diary and not just a timetable. */}
            {row.notes && (
              <ThemedText
                type="small"
                themeColor="textSecondary"
                numberOfLines={1}
                style={styles.noteLine}>
                “{firstLine(row.notes)}”
              </ThemedText>
            )}
          </View>
        </SheenCard>
      </Pressable>
  );
  if (onSelect) return card;
  return (
    <Link
      href={{
        pathname: '/journey/[id]',
        params: { id: row.id, from: row.fromCode, to: row.toCode },
      }}
      asChild>
      {card}
    </Link>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  // Tabletop (Flex mode): the pane above the hinge — hero centered in it.
  topPane: {
    width: '100%',
  },
  topPaneSafe: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
  },
  // The list pane starts at the hinge, which provides no visual breathing
  // room of its own.
  belowHinge: {
    paddingTop: Spacing.three,
  },
  // Book posture / expanded windows: list left, selected trip's detail right,
  // seam on the hinge when there is one.
  panes: {
    flex: 1,
    flexDirection: 'row',
  },
  paneDivider: {
    width: StyleSheet.hairlineWidth,
  },
  detailPane: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  titleBlock: {
    flex: 1,
    gap: Spacing.half,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  titleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  addCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 12,
  },
  addFallback: {
    shadowColor: '#0B1520',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  list: {
    gap: Spacing.two,
    // Breathing room past the auto tab-bar inset when scrolled to the end.
    paddingBottom: Spacing.three,
  },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.two,
  },
  rowPressed: {
    opacity: 0.9,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  metaCarrier: {
    flex: 1,
  },
  route: {
    fontSize: 16,
  },
  noteLine: {
    fontStyle: 'italic',
    marginTop: Spacing.half,
  },
  claimBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    borderRadius: Spacing.two,
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
    gap: Spacing.one,
  },
  spacedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // The deck: the front card's height plus the two peeks above it.
  ghostDeck: {
    height: GHOST_CARD_HEIGHT + 2 * GHOST_PEEK,
    marginTop: Spacing.one,
  },
  ghostCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: GHOST_CARD_HEIGHT,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(242,246,251,0.12)',
    backgroundColor: 'rgba(242,246,251,0.06)',
  },
  ghostCardFront: {
    top: 2 * GHOST_PEEK,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    // Opaque (the sky lifted ~10% toward white) so the cards behind read as
    // peeking out, not as showing through.
    backgroundColor: '#22395F',
    borderColor: 'rgba(242,246,251,0.18)',
  },
  ghostCardBack1: {
    top: GHOST_PEEK,
    left: Spacing.three,
    right: Spacing.three,
    opacity: 0.7,
  },
  ghostCardBack2: {
    top: 0,
    left: Spacing.four + Spacing.two,
    right: Spacing.four + Spacing.two,
    opacity: 0.4,
  },
  // Skeleton of the real row: a 40pt logo tile, then meta / cities / times.
  ghostLogo: {
    width: 40,
    height: 40,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(242,246,251,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBody: {
    flex: 1,
    gap: Spacing.one + Spacing.half,
  },
  ghostBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: WHITE_FAINT,
  },
  ghostBarMeta: {
    width: '44%',
  },
  ghostBarRoute: {
    width: '78%',
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(242,246,251,0.28)',
  },
  ghostBarSchedule: {
    width: '60%',
  },
  ghostChip: {
    width: 40,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(127,177,242,0.45)',
  },
  rotated: {
    transform: [{ rotate: '90deg' }],
  },
  heroCopy: {
    gap: Spacing.two,
  },
  heroHeadline: {
    color: WHITE,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 700,
    letterSpacing: -0.3,
  },
  heroPitch: {
    color: WHITE_DIM,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: 500,
  },
});
