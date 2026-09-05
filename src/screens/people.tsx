import { useAuth } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { trackEvent } from '@/services/analytics';
import { formatDayLabel } from '@/services/dates';
import { useProLocked } from '@/services/purchases';
import { STAGE_LABELS, type TravelStage } from '@/services/travel-day';

type CircleList = NonNullable<ReturnType<typeof useQuery<typeof api.circle.list>>>;
type Following = CircleList['following'][number];
type Follower = CircleList['followers'][number];
type Incoming = CircleList['incoming'][number];
type Outgoing = CircleList['outgoing'][number];

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

/** "2 following · 3 watching you" — the header eyebrow, My travels-style. */
function circleEyebrow(data: CircleList | null | undefined): string {
  if (!data) return 'Your circle';
  const parts: string[] = [];
  if (data.incoming.length) {
    parts.push(`${data.incoming.length} invitation${data.incoming.length > 1 ? 's' : ''}`);
  }
  if (data.following.length) parts.push(`${data.following.length} following`);
  if (data.followers.length) parts.push(`${data.followers.length} watching you`);
  return parts.join(' · ') || 'Your circle';
}

/** The People tab: Find My for flights. Who shares their trips with you
 * (with their live or next flight), and who you share yours with. Render
 * only under CloudSync (Convex configured). */
export function People() {
  const { isSignedIn } = useAuth();
  const data = useQuery(api.circle.list, isSignedIn ? {} : 'skip');
  const invite = useInvite(!!data?.full);
  const proLocked = useProLocked();

  let body: React.ReactNode;
  if (!isSignedIn) {
    body = (
      <>
        <CircleHero
          headline="Travel together, apart"
          pitch="Family and friends follow your trips, step by step — nobody has to ask “landed yet?”"
          action="Sign in to invite"
          onAction={invite}
        />
      </>
    );
  } else if (data == null) {
    // undefined while loading; null while Convex auth is still settling.
    body = <ActivityIndicator style={styles.spinner} />;
  } else if (
    !data.following.length &&
    !data.followers.length &&
    !data.incoming.length &&
    !data.outgoing.length
  ) {
    body = (
      <>
        <CircleHero
          headline="Nobody's following you yet"
          pitch="Invite the people who'd text “boarded yet?” — they'll know before they think to ask."
          action="Invite someone"
          onAction={invite}
        />
        <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
          Invite links expire after 7 days. Anyone you invite can share their trips back.
        </ThemedText>
      </>
    );
  } else {
    body = (
      <>
        {/* Answer first: someone is waiting on it. */}
        {data.incoming.length > 0 && (
          <>
            <SectionLabel>Invitations</SectionLabel>
            {data.incoming.map((r) => (
              <RequestRow key={r.id} request={r} />
            ))}
          </>
        )}
        {data.following.length > 0 && (
          <>
            <SectionLabel>Following</SectionLabel>
            {data.following.map((p) => (
              <FollowingRow key={p.userId} person={p} />
            ))}
          </>
        )}
        <SectionLabel>Sharing with</SectionLabel>
        {data.followers.map((p) => (
          <FollowerRow key={p.userId} person={p} />
        ))}
        {data.outgoing.map((r) => (
          <PendingRow key={r.id} request={r} />
        ))}
        <InviteRow locked={data.full && proLocked} onInvite={invite} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
          People you share with see your upcoming flights and get updates on travel day. Remove
          anyone at any time.
        </ThemedText>
      </>
    );
  }

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
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}>
          {body}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
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
  const setMuted = useMutation(api.circle.setMuted);
  const leave = useMutation(api.circle.leave);

  const actions = () =>
    Alert.alert(person.name, undefined, [
      {
        text: person.muted ? 'Unmute updates' : 'Mute updates',
        onPress: () => void setMuted({ ownerId: person.userId, muted: !person.muted }),
      },
      {
        text: 'Stop following',
        style: 'destructive',
        onPress: () =>
          Alert.alert(`Stop following ${person.name}?`, 'You can be invited again later.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Stop following',
              style: 'destructive',
              onPress: () => void leave({ ownerId: person.userId }),
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

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
        onPress={() =>
          live.token
            ? router.push({ pathname: '/trip/[token]', params: { token: live.token } })
            : actions()
        }
        onLongPress={actions}
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
              {next.fromCode} → {next.toCode} · {formatDayLabel(next.scheduledDeparture)}
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              No upcoming trips
            </ThemedText>
          )}
        </View>
        {next && <AirlineLogo number={next.number} carrier={next.carrier} size={32} />}
        {person.muted && (
          <SymbolView
            name={{ ios: 'bell.slash', android: 'notifications_off', web: 'notifications_off' }}
            size={16}
            tintColor={theme.textSecondary}
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

/** Someone following my trips — the Find My "who can see me" list. */
function FollowerRow({ person }: { person: Follower }) {
  const theme = useTheme();
  const remove = useMutation(api.circle.remove);

  const actions = () =>
    Alert.alert(person.name, `Following your trips since ${formatDayLabel(person.since)}.`, [
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            `Remove ${person.name}?`,
            'They stop seeing your trips and getting updates. You can invite them again later.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: () => void remove({ memberId: person.userId }),
              },
            ],
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

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
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            Following since {formatDayLabel(person.since)}
          </ThemedText>
        </View>
        <SymbolView
          name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
          size={18}
          tintColor={theme.textSecondary}
        />
      </SheenCard>
    </Pressable>
  );
}

/** Dashed "add another" row closing the list. `locked` is the free cap:
 * same row, Pro pitch, and the tap opens the paywall (see useInvite). */
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

/** An invitation I sent that hasn't been answered — a seat held open in
 * Sharing with, tap to take it back. */
function PendingRow({ request }: { request: Outgoing }) {
  const cancel = useMutation(api.circle.cancelRequest);

  const actions = () =>
    Alert.alert(request.name, `Invited ${formatDayLabel(request.since)}. Not answered yet.`, [
      {
        text: 'Withdraw invitation',
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
            Invited — waiting for them
          </ThemedText>
        </View>
      </SheenCard>
    </Pressable>
  );
}

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
  footnote: {
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
    marginTop: Spacing.one,
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
