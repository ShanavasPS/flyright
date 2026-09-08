import { useAuth } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import * as Clipboard from 'expo-clipboard';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import { CIRCLE_FULL, FREE_CIRCLE_SIZE } from '../../convex/circleShared';

import { AirlineLogo } from '@/components/airline-logo';
import { Avatar } from '@/components/avatar';
import { PassAction, PassCard, PassDivider, MicroLabel } from '@/components/pass-card';
import { SegmentTabs } from '@/components/segment-tabs';
import { IconBadge, SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  COBALT,
  MiniContrail,
  WHITE,
  WHITE_DIM,
  WHITE_FAINT,
} from '@/components/travel-stats-header';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { trackEvent } from '@/services/analytics';
import { inviteTokenFrom } from '@/services/circle';
import { formatDayLabel } from '@/services/dates';
import { useProLocked } from '@/services/purchases';
import { STAGE_LABELS, type TravelStage } from '@/services/travel-day';

type CircleList = NonNullable<ReturnType<typeof useQuery<typeof api.circle.list>>>;
type Following = CircleList['following'][number];
type Follower = CircleList['followers'][number];
type Incoming = CircleList['incoming'][number];
type Outgoing = CircleList['outgoing'][number];
type Tab = 'following' | 'followers';

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
function followingItems(data: CircleList): Item[] {
  const items: Item[] = [];
  if (data.incoming.length) {
    items.push({ key: 'label:invitations', type: 'label', text: 'Invitations' });
    for (const r of data.incoming) items.push({ key: `request:${r.id}`, type: 'request', request: r });
    if (data.following.length) items.push({ key: 'label:following', type: 'label', text: 'Following' });
  }
  for (const p of data.following) items.push({ key: `following:${p.userId}`, type: 'following', person: p });
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
const LIVE_GREEN = '#2FD68C';

/** The one way into someone's circle: the add-person sheet, which searches
 * FlyRight for people who already have it and falls back to the share link
 * for everyone else. Signed-out users go through sign-in first (followers
 * are addressed by Clerk id); a free account already at FREE_CIRCLE_SIZE
 * goes to the paywall, since the server would refuse either invitation. */
function useInvite(full: boolean) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const proLocked = useProLocked();

  return () => {
    if (!isSignedIn) {
      router.push({ pathname: '/sign-in', params: { next: '/people' } });
      return;
    }
    if (full && proLocked) {
      router.push({ pathname: '/paywall', params: { next: '/people' } });
      return;
    }
    router.push('/add-person');
  };
}

/** "2 following · 3 followers · 1 waiting" — the header eyebrow, My
 * travels-style. Waiting = requests for me to answer, of either kind. */
function circleEyebrow(data: CircleList | null | undefined): string {
  if (!data) return 'Your circle';
  const parts: string[] = [];
  if (data.following.length) parts.push(`${data.following.length} following`);
  if (data.followers.length) {
    parts.push(`${data.followers.length} follower${data.followers.length > 1 ? 's' : ''}`);
  }
  const waiting = data.incoming.length + data.followRequests.length;
  if (waiting) parts.push(`${waiting} waiting`);
  return parts.join(' · ') || 'Your circle';
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

/** The circle-full failure in one place: Pro fixes it for a free account,
 * otherwise it is simply said. `whose` names the circle that is full. */
function circleFullAlert(
  e: unknown,
  whose: string,
  proLocked: boolean,
  router: ReturnType<typeof useRouter>,
  fallback: string,
) {
  if (e instanceof ConvexError && e.data === CIRCLE_FULL) {
    if (whose === 'Your' && proLocked) {
      router.push({ pathname: '/paywall', params: { next: '/people' } });
      return;
    }
    Alert.alert(
      `${whose} circle is full`,
      whose === 'Your'
        ? 'Remove someone to make room.'
        : `They can make room with FlyRight Pro.`,
    );
    return;
  }
  Alert.alert(fallback, 'Check your connection and try again.');
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
  const invite = useInvite(!!data?.full);
  const proLocked = useProLocked();
  // Null until the data is in: the tab with something waiting on it opens
  // first, and that choice is pinned (below) the moment it is made — a
  // request answered must not flip the page under the thumb that answered it.
  const [picked, setPicked] = useState<Tab | null>(null);

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
    const tab: Tab =
      picked ??
      (data.followRequests.length && !data.incoming.length ? 'followers' : 'following');
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
          {
            key: 'following',
            label: 'Following',
            count: data.following.length,
            badge: data.incoming.length,
          },
          {
            key: 'followers',
            label: 'Followers',
            count: data.followers.length,
            badge: data.followRequests.length,
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
      items = followersItems(data, data.full && proLocked);
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
        return <FollowingRow person={item.person} />;
      case 'follower':
        return <FollowerRow person={item.person} />;
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <ThemedText
              type="smallBold"
              themeColor="textSecondary"
              style={styles.eyebrow}
              numberOfLines={1}>
              {isSignedIn ? circleEyebrow(data) : 'Travel together'}
            </ThemedText>
            <ThemedText type="title" themeColor="heading">
              People
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
    </ThemedView>
  );
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
function FollowingRow({ person }: { person: Following }) {
  const theme = useTheme();
  const router = useRouter();
  const proLocked = useProLocked();
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
      circleFullAlert(e, 'Your', proLocked, router, `Couldn't share with ${person.name}`);
    } finally {
      setBusy(false);
    }
  };

  // Tapping a name asks "where are they going?", which an action sheet could
  // never answer — and it put "stop following" one tap from a row anyone
  // might press by accident. Both decisions live on the page now.
  const actions = () =>
    router.push({ pathname: '/person/[id]', params: { id: person.userId } });

  const live = person.live;
  if (live) {
    const s = live.session;
    const stage = (s.currentStage as TravelStage | null) ?? null;
    const delayed = s.delayMinutes != null && s.delayMinutes >= 30;
    let status = stage ? STAGE_LABELS[stage] : 'Getting ready';
    if (delayed) status += ` · ${s.delayMinutes} min late`;
    else if (s.gate) status += ` · Gate ${s.gate}`;
    return (
      <Pressable
        accessibilityRole="button"
        onPress={actions}
        style={({ pressed }) => pressed && styles.pressed}>
        <PassCard style={styles.livePass}>
          <View style={styles.row}>
            <Avatar name={person.name} imageUrl={person.imageUrl} size={44} ring={LIVE_GREEN} />
            <View style={styles.rowBody}>
              <Text style={styles.liveName} numberOfLines={1}>
                {person.name}
              </Text>
              <Text style={[styles.liveStatus, delayed && styles.liveDelayed]} numberOfLines={1}>
                {status}
              </Text>
            </View>
            <LivePill />
          </View>
          <View style={styles.liveRoute}>
            <Text style={styles.liveCode}>{s.fromCode}</Text>
            <View style={styles.liveContrail}>
              <View style={styles.liveEndDot} />
              <View style={styles.liveDots}>
                {Array.from({ length: 6 }, (_, i) => (
                  <View key={i} style={styles.liveDot} />
                ))}
              </View>
              <SymbolView
                name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
                size={14}
                tintColor={delayed ? '#F2B441' : COBALT}
                style={Platform.OS === 'ios' ? undefined : styles.rotated}
              />
              <View style={styles.liveDots}>
                {Array.from({ length: 6 }, (_, i) => (
                  <View key={i} style={styles.liveDot} />
                ))}
              </View>
              <View style={styles.liveEndDot} />
            </View>
            <Text style={[styles.liveCode, styles.liveCodeRight]}>{s.toCode}</Text>
            <View style={styles.liveLogo}>
              <AirlineLogo number={s.number} carrier={s.carrier} size={28} />
            </View>
          </View>
        </PassCard>
      </Pressable>
    );
  }

  const next = person.next;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={actions}
      style={({ pressed }) => pressed && styles.pressed}>
      <SheenCard style={styles.rowCard}>
        <Avatar name={person.name} imageUrl={person.imageUrl} size={44} />
        <View style={styles.rowBody}>
          <ThemedText themeColor="heading" numberOfLines={1}>
            {person.name}
          </ThemedText>
          {next ? (
            <ThemedText type="small" numberOfLines={1} style={{ color: theme.tint }}>
              {next.fromCode} → {next.toCode} ·{' '}
              {formatDayLabel(next.scheduledDeparture, airportZone(next.fromCode))}
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
      </SheenCard>
    </Pressable>
  );
}

/** Pulsing-dot "LIVE" chip on the night-sky pass. */
function LivePill() {
  return (
    <View style={styles.livePill}>
      <View style={styles.livePillDot} />
      <Text style={styles.livePillText}>Live</Text>
    </View>
  );
}

/** Someone following my trips — the Find My "who can see me" list. When I
 * don't follow them back the row says so with the ask itself: "Follow back"
 * sends them a request (their trips are theirs to share — it is not
 * granted here), and while it is out the chip reads "Requested", tap to
 * withdraw. Someone who already invited me is followed on the spot. */
function FollowerRow({ person }: { person: Follower }) {
  const theme = useTheme();
  const router = useRouter();
  const ask = useMutation(api.circle.askToFollow);
  const cancel = useMutation(api.circle.cancelRequest);
  const [busy, setBusy] = useState(false);

  const onFollowBack = async () => {
    setBusy(true);
    try {
      const result = await ask({ userId: person.userId });
      trackEvent('circle_follow_back', { status: result.status });
    } catch (e) {
      circleFullAlert(e, `${person.name}'s`, false, router, `Couldn't ask ${person.name}`);
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
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/person/[id]', params: { id: person.userId } })}
      style={({ pressed }) => pressed && styles.pressed}>
      <SheenCard style={styles.rowCard}>
        <Avatar name={person.name} imageUrl={person.imageUrl} size={44} />
        <View style={styles.rowBody}>
          <ThemedText themeColor="heading" numberOfLines={1}>
            {person.name}
          </ThemedText>
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
  );
}

/** The one action a row carries, on its right: filled for the thing to do,
 * quiet for a state that is waiting on someone else. */
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
  const router = useRouter();
  const proLocked = useProLocked();
  const respond = useMutation(api.circle.respondToRequest);
  const [busy, setBusy] = useState(false);

  const answer = async (accept: boolean) => {
    setBusy(true);
    try {
      await respond({ requestId: request.id, accept });
      trackEvent('circle_follow_request_answered', { accept });
    } catch (e) {
      // My circle is at the free cap; the request stays here for after.
      circleFullAlert(e, 'Your', proLocked, router, `Couldn't answer that just now`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheenCard style={styles.rowCard}>
      <Avatar name={request.name} imageUrl={request.imageUrl} size={44} />
      <View style={styles.rowBody}>
        <ThemedText themeColor="heading" numberOfLines={1}>
          {request.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          Wants to follow your trips
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
      await respond({ requestId: request.id, accept });
      if (accept) trackEvent('circle_joined');
    } catch (e) {
      // Their circle filled up while the invitation sat here; it stays
      // pending, so nothing is lost by saying so and leaving it.
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
      <Avatar name={request.name} imageUrl={request.imageUrl} size={44} />
      <View style={styles.rowBody}>
        <ThemedText themeColor="heading" numberOfLines={1}>
          {request.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          Invited you to follow their trips
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

  const actions = () =>
    Alert.alert(request.name, `${verb} ${formatDayLabel(request.since)}. Not answered yet.`, [
      {
        text: kind === 'invite' ? 'Withdraw invitation' : 'Withdraw request',
        style: 'destructive',
        onPress: () => void cancel({ requestId: request.id }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={actions}
      style={({ pressed }) => pressed && styles.pressed}>
      <SheenCard style={[styles.rowCard, styles.pendingRow]}>
        <Avatar name={request.name} imageUrl={request.imageUrl} size={44} />
        <View style={styles.rowBody}>
          <ThemedText themeColor="heading" numberOfLines={1}>
            {request.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {verb} — waiting for them
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
            {locked ? 'Add your whole family with Pro' : 'Invite someone'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {locked
              ? `Free includes ${FREE_CIRCLE_SIZE === 1 ? 'one person' : `${FREE_CIRCLE_SIZE} people`} — Pro has no limit`
              : 'Search FlyRight by name or email, or share a link'}
          </ThemedText>
        </View>
      </View>
    </Pressable>
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
  inviteRow: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  livePass: {
    gap: Spacing.three,
    padding: Spacing.three,
  },
  liveName: {
    color: WHITE,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 700,
  },
  liveStatus: {
    color: COBALT,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  liveDelayed: {
    color: '#F2B441',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.three,
    backgroundColor: 'rgba(47,214,140,0.16)',
  },
  livePillDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: LIVE_GREEN,
  },
  livePillText: {
    color: LIVE_GREEN,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  liveRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  liveCode: {
    color: WHITE,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: 700,
    letterSpacing: 1,
  },
  liveCodeRight: {
    textAlign: 'right',
  },
  liveContrail: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  liveDots: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  liveDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: WHITE_DIM,
    opacity: 0.55,
  },
  liveEndDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: WHITE_DIM,
  },
  liveLogo: {
    marginLeft: Spacing.two,
  },
  rotated: {
    transform: [{ rotate: '90deg' }],
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
