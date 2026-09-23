import { useAuth } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import * as Clipboard from 'expo-clipboard';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import { CIRCLE_FULL } from '../../convex/circleShared';

import { AirlineLogo } from '@/components/airline-logo';
import { Avatar } from '@/components/avatar';
import { PaneOutline } from '@/components/pane-placeholders';
import { PassAction, PassCard, PassDivider, MicroLabel } from '@/components/pass-card';
import { LivePass } from '@/components/live-pass';
import { RouteLeg } from '@/components/route-leg';
import { SegmentTabs } from '@/components/segment-tabs';
import { PadTabBarClearance, SplitPanes } from '@/components/split-panes';
import { IconBadge, SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  MiniContrail,
  WHITE,
  WHITE_DIM,
  WHITE_FAINT,
} from '@/components/travel-stats-header';
import { MaxContentWidth, Spacing, paneWidth } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useSplitLayout } from '@/hooks/use-split-layout';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { trackEvent } from '@/services/analytics';
import { inviteTokenFrom } from '@/services/circle';
import { formatDayLabel } from '@/services/dates';
import { keepOrFallback, pickPerson } from '@/services/default-pick';
import { onHomeScreen, spanLabel } from '@/services/public-session';
import { Person } from '@/screens/person';

type CircleList = NonNullable<ReturnType<typeof useQuery<typeof api.circle.list>>>;
type Following = CircleList['following'][number];
type Follower = CircleList['followers'][number];
type Incoming = CircleList['incoming'][number];
type Outgoing = CircleList['outgoing'][number];
type Tab = 'following' | 'followers';

/** Wide window only (docs/wide-layouts-plan.md §5): who is open in the pane
 * beside the list, and how a row opens someone there instead of pushing
 * their page. Absent on phones, so every row behaves as it always has. */
const PersonPane = createContext<{ selectedId: string | null; open: (userId: string) => void } | null>(
  null,
);

/** One row of a tab, as data: the tabs are FlatLists, so a circle of any
 * size mounts only the rows on screen. Section labels and the empty card
 * are rows too — the list is the whole body; only the tail (footnote, paste
 * link) is a footer. */
type Item =
  | { key: string; type: 'label'; text: string }
  | { key: string; type: 'request'; request: Incoming }
  | { key: string; type: 'followRequest'; request: Incoming }
  | { key: string; type: 'following'; person: Following }
  | { key: string; type: 'follower'; person: Follower }
  | { key: string; type: 'pending'; request: Outgoing; kind: 'invite' | 'follow' }
  | { key: string; type: 'note'; count: number }
  | { key: string; type: 'empty'; title: string; detail: string }
  | { key: string; type: 'invite'; locked: boolean };


/** Whose trips I follow. Invitations to follow someone answer at the top,
 * because someone is waiting on it; then the people, live trips first; then
 * the asks I have out to people who don't follow me (asks to a follower show
 * on their row in Followers instead). */
function followingItems(
  data: CircleList,
  /** Who is on the rail right now — the same entries it draws, so the list
   * below it excludes exactly those people and no others. Reading `p.live`
   * instead approximated it, and the two disagreed the moment a live card
   * outlived its window: the person fell off the rail but kept their pass,
   * which then rendered a finished trip under "Coming up". */
): Item[] {
  const items: Item[] = [];
  if (data.incoming.length) {
    items.push({ key: 'label:invitations', type: 'label', text: 'Invitations' });
    for (const r of data.incoming) items.push({ key: `request:${r.id}`, type: 'request', request: r });
  }
  // Everyone I follow, in one list, live trips first — a person in the air
  // gets their own pass (FollowingRow draws LivePass), which is the fuller
  // view of a trip than a face on a rail.
  //
  // Neither the rail nor what they have posted is here any more: Home leads
  // with both, and the same thing on two tabs is one screen shown twice —
  // the thing this rework set out to stop. This tab is the circle itself:
  // who is in it, who is asking, and when each of them next flies.
  const rest = data.following;
  if (rest.length && data.incoming.length) {
    items.push({ key: 'label:following', type: 'label', text: 'Following' });
  }
  for (const p of rest) items.push({ key: `following:${p.userId}`, type: 'following', person: p });
  for (const r of data.asked) items.push({ key: `pending:${r.id}`, type: 'pending', request: r, kind: 'follow' });
  if (!data.following.length && !data.incoming.length) {
    items.push({
      key: 'empty',
      type: 'empty',
      title: "You're not following anyone yet",
      detail: data.followers.length
        ? 'Follow back anyone in Followers to see their trips here, or paste an invite link someone sent you.'
        : 'When someone shares their trips with you, they show up here with their next flight.',
    });
  }
  return items;
}

/** Who follows my trips. Asks to follow me answer at the top; then the
 * people, each with "Follow back" when I don't follow them; then the
 * invitations I have out, and the door for more. */
function followersItems(data: CircleList, locked: boolean): Item[] {
  const items: Item[] = [];
  if (data.followRequests.length) {
    items.push({ key: 'label:requests', type: 'label', text: 'Requests' });
    for (const r of data.followRequests) {
      items.push({ key: `followRequest:${r.id}`, type: 'followRequest', request: r });
    }
  }
  items.push({ key: 'note', type: 'note', count: data.followers.length });
  for (const p of data.followers) items.push({ key: `follower:${p.userId}`, type: 'follower', person: p });
  for (const r of data.outgoing) items.push({ key: `pending:${r.id}`, type: 'pending', request: r, kind: 'invite' });
  items.push({ key: 'invite', type: 'invite', locked });
  return items;
}

// The navy the hero avatars are ringed in — the pass card's own surface, so
// overlapping faces cut cleanly into each other.
const NAVY = '#0C1B36';

/** The one way into someone's circle: the add-person sheet, which searches
 * FlyRight for people who already have it and falls back to the share link
 * for everyone else. Signed-out users go through sign-in first (followers
 * are addressed by Clerk id). Following is free. */
function useInvite() {
  const router = useRouter();
  const { isSignedIn } = useAuth();

  return () => {
    if (!isSignedIn) {
      router.push({ pathname: '/sign-in', params: { next: '/people' } });
      return;
    }
    router.push('/add-person');
  };
}

/** Which side opens first: the one with something new on it — a request
 * to answer, or an arrival not yet looked at. Following wins a tie; it is
 * where the trips are. */
function defaultTab(data: CircleList): Tab {
  const followersNews = data.followRequests.length + data.unseen.followers;
  const followingNews = data.incoming.length + data.unseen.following;
  return followersNews && !followingNews ? 'followers' : 'following';
}

/** The rows that are news right now — someone who joined, someone who
 * allowed my ask — by row key, so the "New" mark can outlive the server's
 * "seen" stamp for as long as the page stays open. Requests aren't marked:
 * their answer chips already say they are waiting. */
function freshRowKeys(data: CircleList): Set<string> {
  const keys = new Set<string>();
  for (const p of data.followers) if (p.fresh) keys.add(`follower:${p.userId}`);
  for (const p of data.following) if (p.fresh) keys.add(`following:${p.userId}`);
  return keys;
}

/** Whether the People tab has anything to show under tabs at all. */
function circleEmpty(data: CircleList): boolean {
  return (
    !data.following.length &&
    !data.followers.length &&
    !data.incoming.length &&
    !data.followRequests.length &&
    !data.outgoing.length &&
    !data.asked.length
  );
}

/** A legacy server rejection never sends a follower to checkout. */
function circleFullAlert(e: unknown, fallback: string) {
  Alert.alert(fallback, e instanceof ConvexError && e.data === CIRCLE_FULL
    ? 'Following is free. Please try again in a moment.'
    : 'Check your connection and try again.');
}

/** The People tab: Find My for flights. Two tabs, Instagram-style: whose
 * trips I follow (with their live or next flight) and who follows mine.
 * Each row carries the one thing to do about the person — follow back,
 * share back, answer a request — so a follow can be returned in one tap
 * instead of the other person having to think to invite. Render only under
 * CloudSync (Convex configured). */
export function People() {
  const theme = useTheme();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const data = useQuery(api.circle.list, isSignedIn ? {} : 'skip');
  const invite = useInvite();
  const focused = useIsFocused();
  const markSeen = useMutation(api.attention.markPeopleSeen);
  // Null until the data is in: the tab with something waiting on it opens
  // first, and that choice is pinned (below) the moment it is made — a
  // request answered must not flip the page under the thumb that answered it.
  const [picked, setPicked] = useState<Tab | null>(null);
  // "See all" on the home screen lands on a named tab. Honoured each time
  // the param changes — so a later hand-off still switches a page already
  // open — with the same set-during-render the default below uses.
  const { tab: wanted } = useLocalSearchParams<{ tab?: string }>();
  const [honoured, setHonoured] = useState<string | undefined>(undefined);
  if (wanted !== honoured) {
    setHonoured(wanted);
    if (wanted === 'following' || wanted === 'followers') setPicked(wanted);
  }

  // Looking at a side is seeing it: while this page is on screen, whatever
  // is fresh on the side showing is marked seen on the server — which
  // clears it from the People tab's badge and the app icon. Re-runs on
  // every data change, so something that arrives while the page is open is
  // seen too, and is a no-op once nothing is fresh.
  useEffect(() => {
    if (!focused || !data) return;
    const side = picked ?? defaultTab(data);
    if (data.unseen[side] > 0) void markSeen({ side });
  }, [focused, data, picked, markSeen]);

  // Wide windows: the list keeps its column and a person opens beside it —
  // by default whoever is in the air, else the next to depart, else the
  // first row. Split once there is something to show (signed out, or the
  // circle has loaded); the spinner stays single-column.
  const layout = useSplitLayout('friends', { primaryWidth: paneWidth(400) });
  const split = layout.split && (!isSignedIn || data != null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Minute ticks: who is in the air (and so the default pick) can change
  // while the page stays open; an explicit tap is never overridden.
  const clock = useNow(60_000);
  const people = useMemo(() => {
    if (!data) return null;
    const flying = new Set(
      data.following.filter((p) => p.live && onHomeScreen(p.live.session, clock)).map((p) => p.userId),
    );
    const ids = new Set([...data.following, ...data.followers].map((p) => p.userId));
    return { ids, pick: () => pickPerson(data.following, data.followers, flying, clock.getTime()) };
  }, [data, clock]);
  const detailId = split && people ? keepOrFallback(selectedId, people.ids, people.pick) : null;
  // Pin what the pane shows (see Claims): whoever was in the air when the
  // page opened stays open after they land, until someone else is tapped or
  // they leave the circle.
  useEffect(() => {
    // In an effect, not during render: this screen renders inside a tab that
    // may not have mounted yet, and a render-time update there is an error.
    // Guarded, so it settles after one extra render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (detailId != null && detailId !== selectedId) setSelectedId(detailId);
  }, [detailId, selectedId]);
  const pane = useMemo(
    () => (split ? { selectedId: detailId, open: (userId: string) => setSelectedId(userId) } : null),
    [split, detailId],
  );

  // The "New" marks for this visit: taken from the first data seen while
  // the page is on screen, and kept until it is left — the server's "seen"
  // stamp moves the moment the side is looked at, and a mark that vanished
  // as the eye reached it would be no mark at all.
  // Set during render, like `picked` above.
  const [freshKeys, setFreshKeys] = useState<Set<string> | null>(null);
  if (!focused && freshKeys) setFreshKeys(null);
  if (focused && data && !freshKeys) setFreshKeys(freshRowKeys(data));
  const isFresh = (key: string) => !!freshKeys?.has(key);

  let tabs: React.ReactNode = null;
  let body: React.ReactNode;
  let items: Item[] | null = null;
  let footer: React.ReactNode = null;
  if (!isSignedIn) {
    body = (
      <>
        <CircleHero
          headline="Travel together, apart"
          pitch="Family and friends follow your trips, step by step — nobody has to ask “landed yet?”"
          action="Sign in to invite"
          onAction={invite}
        />
        <RedeemInviteLink />
      </>
    );
  } else if (data == null) {
    // undefined while loading; null while Convex auth is still settling.
    body = <ActivityIndicator style={styles.spinner} />;
  } else if (circleEmpty(data)) {
    body = (
      <>
        <CircleHero
          headline="Nobody's following you yet"
          pitch="Invite the people who'd text “boarded yet?” — they'll know before they think to ask."
          action="Invite someone"
          onAction={invite}
        />
        <RedeemInviteLink />
        <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
          Invite links expire after 7 days. Anyone you invite can share their trips back.
        </ThemedText>
      </>
    );
  } else {
    const tab: Tab = picked ?? defaultTab(data);
    // Derived once, from the first data, then owned by the user's taps. A
    // set during render (not in an effect) re-runs this render with the
    // pinned value and nothing else.
    if (picked === null) setPicked(tab);
    tabs = (
      <SegmentTabs<Tab>
        value={tab}
        onChange={(t) => {
          trackEvent('people_tab', { tab: t });
          setPicked(t);
        }}
        tabs={[
          // Waiting on an answer, plus arrivals not yet looked at — the
          // latter by the server's word, so it drops once the side is seen.
          {
            key: 'following',
            label: 'Following',
            count: data.following.length,
            badge: data.incoming.length + data.following.filter((p) => p.fresh).length,
          },
          {
            key: 'followers',
            label: 'Followers',
            count: data.followers.length,
            badge:
              data.followRequests.length +
              data.followers.filter((p) => p.fresh).length +
              data.outgoing.filter((r) => r.fresh).length,
          },
        ]}
      />
    );
    if (tab === 'following') {
      items = followingItems(data);
      footer = (
        <>
          <RedeemInviteLink />
          <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
            You see the upcoming flights of everyone you follow and get a heads-up the day before
            each one.
          </ThemedText>
        </>
      );
    } else {
      items = followersItems(data, false);
      footer = (
        <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
          Followers see your upcoming flights and get updates on travel day. Remove anyone at any
          time.
        </ThemedText>
      );
    }
  }

  const renderItem = ({ item }: { item: Item }) => {
    switch (item.type) {
      case 'label':
        return <SectionLabel>{item.text}</SectionLabel>;
      case 'request':
        return <RequestRow request={item.request} />;
      case 'followRequest':
        return <FollowRequestRow request={item.request} />;
      case 'following':
        return <FollowingRow person={item.person} fresh={isFresh(item.key)} />;
      case 'follower':
        return <FollowerRow person={item.person} fresh={isFresh(item.key)} />;
      case 'pending':
        return <PendingRow request={item.request} kind={item.kind} />;
      case 'note':
        return (
          <FollowersNote
            count={item.count}
            onPreview={() => {
              trackEvent('circle_preview_opened', { from: 'people' });
              router.push('/preview');
            }}
            tint={theme.tint}
          />
        );
      case 'empty':
        return <EmptyTab title={item.title} detail={item.detail} />;
      case 'invite':
        return <InviteRow locked={item.locked} onInvite={invite} />;
    }
  };

  const listPane = (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <ThemedText type="tabTitle" themeColor="heading">
              Friends
            </ThemedText>
          </View>
          {isSignedIn && <InviteButton onPress={invite} />}
        </View>
        {/* Outside the list on purpose: the tabs stay put however long
            either list gets — the old single list buried "sharing with"
            under everyone you follow. */}
        {tabs}
        {items ? (
          <FlatList
            data={items}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            ItemSeparatorComponent={RowGap}
            ListFooterComponent={<View style={styles.listFooter}>{footer}</View>}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}>
            {body}
          </ScrollView>
        )}
      </SafeAreaView>
  );

  return (
    <ThemedView style={styles.container}>
      <PersonPane.Provider value={pane}>
        <SplitPanes
          layout={{ ...layout, split }}
          primary={listPane}
          secondary={
            detailId ? (
              // Keyed: another person is another page, not this one morphing.
              <Person key={detailId} userId={detailId} embedded onGone={() => setSelectedId(null)} />
            ) : (
              <SafeAreaView edges={['top', 'right']} style={styles.outlinePane}>
                <PaneOutline
                  kind="person"
                  caption="The people you follow open here, with their flights as they happen."
                />
              </SafeAreaView>
            )
          }
        />
      </PersonPane.Provider>
    </ThemedView>
  );
}

/** On a wide window, a row opens its person in the pane beside the list;
 * everywhere else it pushes their page, as it always has. */
function useOpenPerson(userId: string) {
  const router = useRouter();
  const pane = useContext(PersonPane);
  return {
    open: pane
      ? () => pane.open(userId)
      : () => router.push({ pathname: '/person/[id]', params: { id: userId } }),
    selected: pane?.selectedId === userId,
  };
}

/** The tint outline a selected row wears in the wide layout, the way a
 * selected trip does on Flights. Rows that are not selected render bare. */
function Selected({ on, children }: { on: boolean; children: React.ReactNode }) {
  const theme = useTheme();
  if (!on) return <>{children}</>;
  return <View style={[styles.selected, { borderColor: theme.tint }]}>{children}</View>;
}

function RowGap() {
  return <View style={styles.rowGap} />;
}

/** "3 people see your trips" beside the preview pill — the Followers tab's
 * one line of context above the list. */
function FollowersNote({
  count,
  onPreview,
  tint,
}: {
  count: number;
  onPreview: () => void;
  tint: string;
}) {
  return (
    <View style={styles.spacedRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.tabNote}>
        {count === 0
          ? 'Nobody sees your trips yet'
          : count === 1
            ? '1 person sees your trips'
            : `${count} people see your trips`}
      </ThemedText>
      {/* Your side of the glass: the same page a member opens, rendered
          for the tier you pick (screens/circle-preview). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="See what they see"
        hitSlop={Spacing.one}
        onPress={onPreview}
        style={({ pressed }) => pressed && styles.pressed}>
        <View style={[styles.previewPill, { backgroundColor: `${tint}1A` }]}>
          <SymbolView
            name={{ ios: 'eye', android: 'visibility', web: 'visibility' }}
            size={15}
            weight="semibold"
            tintColor={tint}
          />
          <ThemedText type="smallBold" style={{ color: tint }}>
            See what they see
          </ThemedText>
        </View>
      </Pressable>
    </View>
  );
}

/** A quiet card for a tab with nobody on it yet — not the navy hero, which
 * belongs to the circle that has nobody at all. */
function EmptyTab({ title, detail }: { title: string; detail: string }) {
  return (
    <SheenCard style={styles.emptyTab}>
      <ThemedText themeColor="heading" style={styles.emptyTitle}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {detail}
      </ThemedText>
    </SheenCard>
  );
}

/** The other end of an invite link, for the traveller the link never reached.
 *
 * An invitee who installs from a share link is supposed to land on the
 * invitation: on Android the Play install referrer carries the click id, so
 * that is exact, but on iOS it rests on Detour matching a fingerprint inside
 * fifteen minutes, and when that misses the app opens on an empty journal
 * with no trace of who invited them. It missed on 2026-09-06, and the
 * telemetry shows what that costs: a first launch that went through
 * onboarding and then walked the People tab looking for the invitation,
 * which was never going to be there.
 *
 * The link itself is still in their messages, so this asks for it. One tap,
 * the clipboard, and the same invite page every other door opens on. */
function RedeemInviteLink() {
  const router = useRouter();

  const onPress = async () => {
    const token = inviteTokenFrom(await Clipboard.getStringAsync().catch(() => ''));
    trackEvent('invite_link_pasted', { found: !!token });
    if (!token) {
      Alert.alert(
        'Copy the invite link first',
        'Open the message it arrived in, copy the getflyright.com link, then tap this again.',
      );
      return;
    }
    router.push(`/i/${token}`);
  };

  return (
    <Pressable onPress={() => void onPress()} style={styles.redeemRow} testID="redeem-invite-link">
      <ThemedText type="link">Someone sent you an invite link? Paste it</ThemedText>
    </Pressable>
  );
}

/** The header's round invite button — same glass disc as My travels' "+". */
function InviteButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const glass = isLiquidGlassAvailable();
  const icon = (
    <SymbolView
      name={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }}
      size={20}
      weight="semibold"
      tintColor={glass ? theme.tint : '#ffffff'}
    />
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Invite someone to follow your trips"
      onPress={onPress}>
      {glass ? (
        <GlassView glassEffectStyle="regular" isInteractive style={styles.addCircle}>
          {icon}
        </GlassView>
      ) : (
        <View style={[styles.addCircle, { backgroundColor: theme.tint }]}>{icon}</View>
      )}
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
      {children}
    </ThemedText>
  );
}

/** The navy hero for the signed-out and empty states — the one premium
 * object on the page, in the boarding-pass language of the Trips tab. The
 * stacked faces are placeholders for the circle that isn't there yet. */
function CircleHero({
  headline,
  pitch,
  action,
  busy = false,
  onAction,
}: {
  headline: string;
  pitch: string;
  action: string;
  busy?: boolean;
  onAction: () => void;
}) {
  return (
    <PassCard>
      <View style={styles.spacedRow}>
        <MicroLabel>Your circle</MicroLabel>
        <MiniContrail />
      </View>
      <View style={styles.heroAvatars}>
        {['Anna', 'Mikko', 'Jo'].map((name, i) => (
          <View key={name} style={i ? styles.heroAvatarOverlap : undefined}>
            <Avatar name={name} imageUrl={null} size={48} ring={NAVY} />
          </View>
        ))}
        <View style={[styles.heroAvatarOverlap, styles.heroPlus]}>
          <SymbolView
            name={{ ios: 'plus', android: 'add', web: 'add' }}
            size={20}
            weight="semibold"
            tintColor={WHITE_DIM}
          />
        </View>
      </View>
      <View style={styles.heroCopy}>
        <Text style={styles.heroHeadline}>{headline}</Text>
        <Text style={styles.heroPitch}>{pitch}</Text>
      </View>
      <PassDivider />
      <PassAction
        label={action}
        disabled={busy}
        onPress={onAction}
        icon={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }}
      />
    </PassCard>
  );
}


/** Someone whose trips I follow. Live trip → a mini night-sky pass that opens
 * it; otherwise a sheen row with the next flight (or nothing) as the status
 * line. Long-press (or tap, when not live) for mute/leave. */
function FollowingRow({ person, fresh }: { person: Following; fresh: boolean }) {
  const theme = useTheme();
  const now = useNow();
  const shareBack = useMutation(api.circle.shareBack);
  const [busy, setBusy] = useState(false);

  // "Share back": they share their trips with me and I don't with them.
  // My trips are mine to share, so this needs no answer from anyone — one
  // tap and they follow me, the same join the invite page's offer runs.
  const onShareBack = async () => {
    setBusy(true);
    try {
      await shareBack({ userId: person.userId });
      trackEvent('circle_shared_back', { from: 'people' });
    } catch (e) {
      circleFullAlert(e, `Couldn't share with ${person.name}`);
    } finally {
      setBusy(false);
    }
  };

  // Tapping a name asks "where are they going?", which an action sheet could
  // never answer — and it put "stop following" one tap from a row anyone
  // might press by accident. Both decisions live on the page now.
  const { open: actions, selected } = useOpenPerson(person.userId);

  // A live pass only while its deadline is ahead. The card arrives with the
  // query and the query is reactive to data, not to time, so without this it
  // would sit on the page after the trip stopped being live.
  const live = person.live && onHomeScreen(person.live.session, now) ? person.live : null;
  if (live) {
    return (
      <Selected on={selected}>
        <LivePass
          person={person}
          session={live.session}
          onward={live.onward ?? []}
          now={now}
          onPress={actions}
        />
      </Selected>
    );
  }

  const next = person.next;
  // A booked trip has no airline estimate yet, so the countdown is to the
  // timetable — the same words the live rows use once the day comes.
  const nextMs = next ? Date.parse(next.scheduledDeparture) - now.getTime() : NaN;
  const nextTimer = next && nextMs > 60_000 ? `Departs in ${spanLabel(nextMs)}` : null;
  return (
    <Selected on={selected}>
    <Pressable
      accessibilityRole="button"
      onPress={actions}
      style={({ pressed }) => pressed && styles.pressed}>
      <SheenCard style={styles.nextCard}>
        <View style={styles.row}>
          <Avatar name={person.name} imageUrl={person.imageUrl} size={44} pro={person.pro} />
          <View style={styles.rowBody}>
            <View style={styles.nameLine}>
              <ThemedText themeColor="heading" numberOfLines={1} style={styles.name}>
                {person.name}
              </ThemedText>
              {fresh && <NewMark />}
            </View>
            {next ? (
              <ThemedText type="small" numberOfLines={2} style={{ color: theme.tint }}>
                {formatDayLabel(next.scheduledDeparture, airportZone(next.fromCode))}
                {nextTimer ? ` · ${nextTimer}` : ''}
              </ThemedText>
            ) : (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                No upcoming trips
              </ThemedText>
            )}
          </View>
          {person.followsMe ? (
            <>
              {next && <AirlineLogo number={next.number} carrier={next.carrier} size={32} />}
              {person.muted && (
                <SymbolView
                  name={{ ios: 'bell.slash', android: 'notifications_off', web: 'notifications_off' }}
                  size={16}
                  tintColor={theme.textSecondary}
                />
              )}
            </>
          ) : (
            <RowChip
              label="Share back"
              accessibilityLabel={`Share your trips with ${person.name}`}
              testID="share-back"
              busy={busy}
              onPress={() => void onShareBack()}
            />
          )}
        </View>
        {/* The first leg only, on its own line under the header. The row is
            a glance at when they next fly; connections and layovers belong
            on the person's page, where there is room to lay the journey out. */}
        {next && (
          <View style={styles.nextLeg}>
            <RouteLeg
              compact
              leg={{
                fromCode: next.fromCode,
                toCode: next.toCode,
                departure: next.scheduledDeparture,
                arrival: next.scheduledArrival,
              }}
            />
          </View>
        )}
      </SheenCard>
    </Pressable>
    </Selected>
  );
}

/** Pulsing-dot "LIVE" chip on the night-sky pass. */

/** Someone following my trips — the Find My "who can see me" list. When I
 * don't follow them back the row says so with the ask itself: "Follow back"
 * sends them a request (their trips are theirs to share — it is not
 * granted here), and while it is out the chip reads "Requested", tap to
 * withdraw. Someone who already invited me is followed on the spot. */
function FollowerRow({ person, fresh }: { person: Follower; fresh: boolean }) {
  const theme = useTheme();
  const { open: openPerson, selected } = useOpenPerson(person.userId);
  const ask = useMutation(api.circle.askToFollow);
  const cancel = useMutation(api.circle.cancelRequest);
  const [busy, setBusy] = useState(false);

  const onFollowBack = async () => {
    setBusy(true);
    try {
      const result = await ask({ userId: person.userId });
      trackEvent('circle_follow_back', { status: result.status });
    } catch (e) {
      circleFullAlert(e, `Couldn't ask ${person.name}`);
    } finally {
      setBusy(false);
    }
  };
  const onRequested = () =>
    Alert.alert(`Asked to follow ${person.name}`, "They haven't answered yet.", [
      {
        text: 'Withdraw request',
        style: 'destructive',
        onPress: () => {
          if (person.askedId) void cancel({ requestId: person.askedId });
        },
      },
      { text: 'Keep waiting', style: 'cancel' },
    ]);

  return (
    <Selected on={selected}>
    <Pressable
      accessibilityRole="button"
      onPress={openPerson}
      style={({ pressed }) => pressed && styles.pressed}>
      <SheenCard style={styles.rowCard}>
        <Avatar name={person.name} imageUrl={person.imageUrl} size={44} pro={person.pro} />
        <View style={styles.rowBody}>
          <View style={styles.nameLine}>
            <ThemedText themeColor="heading" numberOfLines={1} style={styles.name}>
              {person.name}
            </ThemedText>
            {fresh && <NewMark />}
          </View>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {person.close ? 'Close circle · ' : ''}
            {person.following ? 'You follow each other' : `Since ${formatDayLabel(person.since)}`}
          </ThemedText>
        </View>
        {person.following ? (
          <SymbolView
            name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
            size={18}
            tintColor={theme.textSecondary}
          />
        ) : person.askedId ? (
          <RowChip
            label="Requested"
            quiet
            accessibilityLabel={`Asked to follow ${person.name}. Withdraw`}
            testID="follow-requested"
            onPress={onRequested}
          />
        ) : (
          <RowChip
            label="Follow back"
            accessibilityLabel={`Ask to follow ${person.name}'s trips`}
            testID="follow-back"
            busy={busy}
            onPress={() => void onFollowBack()}
          />
        )}
      </SheenCard>
    </Pressable>
    </Selected>
  );
}

/** The one action a row carries, on its right: filled for the thing to do,
 * quiet for a state that is waiting on someone else. */
/** "New" beside a name: someone who joined, or allowed my ask, since the
 * side they are on was last looked at. Instagram's "New" section header,
 * per row — the list is sorted by next flight, not arrival, so a section
 * would have to break that order. */
function NewMark() {
  const theme = useTheme();
  return (
    <View style={[styles.newMark, { backgroundColor: theme.tint }]} accessibilityLabel="New">
      <ThemedText type="smallBold" style={styles.newMarkText}>
        New
      </ThemedText>
    </View>
  );
}

function RowChip({
  label,
  accessibilityLabel,
  quiet = false,
  busy = false,
  onPress,
  testID,
}: {
  label: string;
  accessibilityLabel: string;
  quiet?: boolean;
  busy?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={busy}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.answerChip,
        { backgroundColor: quiet ? theme.field : theme.tint },
        pressed && styles.pressed,
      ]}>
      {busy ? (
        <ActivityIndicator color={quiet ? theme.textSecondary : '#ffffff'} />
      ) : (
        <ThemedText
          type="smallBold"
          themeColor={quiet ? 'textSecondary' : undefined}
          style={quiet ? undefined : styles.answerChipLabel}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

/** Someone asking to follow MY trips — "Follow back" from their side. Allow
 * runs the same join an accepted invitation does, with me as the owner. */
function FollowRequestRow({ request }: { request: Incoming }) {
  const respond = useMutation(api.circle.respondToRequest);
  const [busy, setBusy] = useState(false);

  const answer = async (accept: boolean) => {
    setBusy(true);
    try {
      await respond({ requestId: request.id, accept });
      trackEvent('circle_follow_request_answered', { accept });
    } catch (e) {
      // My circle is at the free cap; the request stays here for after.
      circleFullAlert(e, `Couldn't answer that just now`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheenCard style={styles.rowCard}>
      <Avatar name={request.name} imageUrl={request.imageUrl} size={44} pro={request.pro} />
      <View style={styles.rowBody}>
        <ThemedText themeColor="heading" numberOfLines={1}>
          {request.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {request.viaLink ? 'Opened your invite link · wants to follow your trips' : 'Wants to follow your trips'}
        </ThemedText>
      </View>
      <View style={styles.answerRow}>
        <RowChip
          label="Allow"
          accessibilityLabel={`Let ${request.name} follow your trips`}
          testID="allow-follow"
          busy={busy}
          onPress={() => void answer(true)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ignore ${request.name}'s request`}
          disabled={busy}
          onPress={() => void answer(false)}
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedText type="small" themeColor="textSecondary">
            Ignore
          </ThemedText>
        </Pressable>
      </View>
    </SheenCard>
  );
}

/** An invitation waiting on me: "<name> invited you to follow their trips",
 * with the two answers on the row. Accepting runs the same join a redeemed
 * link does, so this lands in Following exactly like the web invite. */
function RequestRow({ request }: { request: Incoming }) {
  const theme = useTheme();
  const respond = useMutation(api.circle.respondToRequest);
  const [busy, setBusy] = useState(false);

  const answer = async (accept: boolean) => {
    setBusy(true);
    try {
      const r = await respond({ requestId: request.id, accept });
      // Their circle filled up while the invitation sat here (they invited
      // more people than a free account seats); it stays pending, and the
      // server has told them — once — that I tried.
      if (r.status === 'full') {
        Alert.alert(
          `${request.name}'s circle is full`,
          `${request.name} has been told you tried. The invitation stays here until they make room — FlyRight Pro lets their whole family follow.`,
        );
        return;
      }
      if (accept) trackEvent('circle_joined');
    } catch (e) {
      Alert.alert(
        e instanceof ConvexError && e.data === CIRCLE_FULL
          ? `${request.name}'s circle is full`
          : `Couldn't answer that just now`,
        e instanceof ConvexError && e.data === CIRCLE_FULL
          ? `${request.name} can make room with FlyRight Pro. The invitation stays here.`
          : 'Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheenCard style={styles.rowCard}>
      <Avatar name={request.name} imageUrl={request.imageUrl} size={44} pro={request.pro} />
      <View style={styles.rowBody}>
        <ThemedText themeColor="heading" numberOfLines={1}>
          {request.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {request.blocked
            ? 'Invited you — their circle is full for now'
            : 'Invited you to follow their trips'}
        </ThemedText>
      </View>
      <View style={styles.answerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Follow ${request.name}'s trips`}
          disabled={busy}
          onPress={() => void answer(true)}
          style={({ pressed }) => [
            styles.answerChip,
            { backgroundColor: theme.tint },
            pressed && styles.pressed,
          ]}>
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <ThemedText type="smallBold" style={styles.answerChipLabel}>
              Follow
            </ThemedText>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ignore ${request.name}'s invitation`}
          disabled={busy}
          onPress={() => void answer(false)}
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedText type="small" themeColor="textSecondary">
            Ignore
          </ThemedText>
        </Pressable>
      </View>
    </SheenCard>
  );
}

/** A request of mine that hasn't been answered — an invitation is a seat
 * held open in Followers, an ask to follow a seat I'm waiting for in
 * Following. Tap to take it back. */
function PendingRow({ request, kind }: { request: Outgoing; kind: 'invite' | 'follow' }) {
  const cancel = useMutation(api.circle.cancelRequest);
  const verb = kind === 'invite' ? 'Invited' : 'Asked to follow';
  // They said yes and found no seat: the row says so, and the sheet offers
  // the fix instead of a withdrawal that would only lose them.
  const blocked = kind === 'invite' && request.blocked;

  const actions = () =>
    Alert.alert(
      request.name,
      blocked
        ? `${request.name} tried to follow your trips, but your circle is full. The invitation waits until you make room.`
        : `${verb} ${formatDayLabel(request.since)}. Not answered yet.`,
      [
        {
          text: kind === 'invite' ? 'Withdraw invitation' : 'Withdraw request',
          style: 'destructive' as const,
          onPress: () => void cancel({ requestId: request.id }),
        },
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );

  return (
    <Pressable
      accessibilityRole="button"
      onPress={actions}
      style={({ pressed }) => pressed && styles.pressed}>
      <SheenCard style={[styles.rowCard, styles.pendingRow]}>
        <Avatar name={request.name} imageUrl={request.imageUrl} size={44} pro={request.pro} />
        <View style={styles.rowBody}>
          <ThemedText themeColor="heading" numberOfLines={1}>
            {request.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {blocked ? 'Tried to follow you — your circle is full' : `${verb} — waiting for them`}
          </ThemedText>
        </View>
      </SheenCard>
    </Pressable>
  );
}

/** Dashed "add another" row closing the list. `locked` is the free cap:
 * same row, Pro pitch, and the tap opens the paywall (see useInvite). */
function InviteRow({ locked, onInvite }: { locked: boolean; onInvite: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onInvite}
      testID={locked ? 'invite-row-locked' : 'invite-row'}
      style={({ pressed }) => pressed && styles.pressed}>
      <View style={[styles.rowCard, styles.inviteRow, { borderColor: `${theme.tint}66` }]}>
        <IconBadge
          symbol={
            locked
              ? { ios: 'lock.fill', android: 'lock', web: 'lock' }
              : { ios: 'plus', android: 'add', web: 'add' }
          }
          size={44}
        />
        <View style={styles.rowBody}>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            Invite someone
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            Search FlyRight by name or email, or share a link
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Wide window: a second pane with nobody to show yet, clear of iPadOS's
  // floating tab bar.
  outlinePane: {
    flex: 1,
    paddingTop: Spacing.four + PadTabBarClearance,
    paddingHorizontal: Spacing.four,
  },
  selected: {
    borderWidth: 1.5,
    borderRadius: Spacing.four + 2,
    padding: 1,
  },
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  titleBlock: {
    flex: 1,
  },
  addCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  listContent: {
    paddingBottom: Spacing.four,
  },
  listFooter: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  rowGap: {
    height: Spacing.two,
  },
  spinner: {
    marginTop: Spacing.six,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
    marginTop: Spacing.two,
  },
  spacedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: Spacing.two + Spacing.half,
    marginTop: Spacing.two,
  },
  heroAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  heroAvatarOverlap: {
    marginLeft: -Spacing.three,
  },
  heroPlus: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: WHITE_FAINT,
    alignItems: 'center',
    justifyContent: 'center',
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    flexShrink: 1,
  },
  newMark: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
  newMarkText: {
    color: '#ffffff',
    fontSize: 11,
    lineHeight: 14,
  },
  nextCard: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  // Avatar 44 + the row gap: the leg lines up with the name above it.
  nextLeg: {
    paddingLeft: 44 + Spacing.three,
  },
  inviteRow: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  tabNote: {
    flex: 1,
    marginTop: Spacing.two,
  },
  emptyTab: {
    padding: Spacing.four,
    gap: Spacing.one,
  },
  emptyTitle: {
    fontWeight: 600,
  },
  footnote: {
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
    marginTop: Spacing.one,
  },
  redeemRow: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  answerRow: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  answerChip: {
    minWidth: 84,
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  answerChipLabel: {
    color: '#ffffff',
  },
  pendingRow: {
    opacity: 0.75,
  },
  pressed: {
    opacity: 0.9,
  },
});
