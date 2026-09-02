import { useAuth, useUser } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { Observe } from 'expo-observe';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';

import { AirlineLogo } from '@/components/airline-logo';
import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { shareInvite } from '@/services/circle-share';
import { formatDayLabel } from '@/services/dates';
import { STAGE_LABELS, type TravelStage } from '@/services/travel-day';

type CircleList = NonNullable<ReturnType<typeof useQuery<typeof api.circle.list>>>;
type Following = CircleList['following'][number];
type Follower = CircleList['followers'][number];

/** Mint an invite link and hand it to the share sheet — the only way into
 * someone's circle. Signed-out users go through sign-in first: followers
 * are addressed by Clerk id. */
function useInvite() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const createInvite = useMutation(api.circle.createInvite);
  const [busy, setBusy] = useState(false);

  const invite = async () => {
    if (!isSignedIn) {
      router.push({ pathname: '/sign-in', params: { next: '/people' } });
      return;
    }
    setBusy(true);
    try {
      const { token } = await createInvite({});
      Observe.logEvent('circle.invited');
      await shareInvite(token, user?.firstName);
    } catch {
      // Offline — the button stays, retry works.
    } finally {
      setBusy(false);
    }
  };
  return { invite, busy };
}

/** The People tab: Find My for flights. Who shares their trips with you
 * (with their live or next flight), and who you share yours with. Render
 * only under CloudSync (Convex configured). */
export function People() {
  const theme = useTheme();
  const { isSignedIn } = useAuth();
  const data = useQuery(api.circle.list, isSignedIn ? {} : 'skip');
  const { invite, busy } = useInvite();

  let body: React.ReactNode;
  if (!isSignedIn) {
    body = (
      <Card>
        <ThemedText type="subtitle">Travel together, apart</ThemedText>
        <ThemedText type="small">
          Invite family and friends to follow your trips. They get a heads-up the day before
          you fly and a nudge at every step — at the airport, through security, on board,
          landed — so nobody has to ask.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Sign in to invite people and follow theirs.
        </ThemedText>
        <PrimaryButton label="Sign in" onPress={invite} />
      </Card>
    );
  } else if (data == null) {
    // undefined while loading; null while Convex auth is still settling.
    body = <ActivityIndicator style={styles.spinner} />;
  } else if (!data.following.length && !data.followers.length) {
    body = <EmptyState onInvite={invite} busy={busy} />;
  } else {
    body = (
      <>
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
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={invite}
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="backgroundElement" style={[styles.row, styles.card]}>
            <View style={[styles.addCircle, { backgroundColor: theme.backgroundSelected }]}>
              <SymbolView
                name={{ ios: 'plus', android: 'add', web: 'add' }}
                size={18}
                weight="semibold"
                tintColor={theme.tint}
              />
            </View>
            <ThemedText style={{ color: theme.tint }}>Invite someone</ThemedText>
          </ThemedView>
        </Pressable>
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
          <ThemedText type="title" themeColor="heading">
            People
          </ThemedText>
          {isSignedIn && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Invite someone to follow your trips"
              disabled={busy}
              onPress={invite}
              hitSlop={Spacing.two}>
              <SymbolView
                name={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }}
                size={24}
                tintColor={theme.tint}
              />
            </Pressable>
          )}
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

function SectionLabel({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
      {children}
    </ThemedText>
  );
}

function EmptyState({ onInvite, busy }: { onInvite: () => void; busy: boolean }) {
  const theme = useTheme();
  return (
    <SheenCard style={styles.empty}>
      <View style={styles.emptyAvatars}>
        {['A', 'M', 'J'].map((letter, i) => (
          <View
            key={letter}
            style={[
              styles.emptyAvatar,
              { backgroundColor: theme.backgroundSelected, marginLeft: i ? -Spacing.three : 0 },
            ]}>
            <ThemedText type="smallBold" themeColor="heading">
              {letter}
            </ThemedText>
          </View>
        ))}
      </View>
      <ThemedText type="subtitle" themeColor="heading">
        Nobody&apos;s following you yet
      </ThemedText>
      <ThemedText type="small">
        Invite family and friends. They get a heads-up the day before you fly and a nudge at
        every step — at the airport, through security, on board, landed — so nobody has to
        ask &ldquo;boarded yet?&rdquo;.
      </ThemedText>
      <PrimaryButton label="Invite someone" disabled={busy} onPress={onInvite} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
        Invite links expire after 7 days. Anyone you invite can share their trips back.
      </ThemedText>
    </SheenCard>
  );
}

/** Someone whose trips I follow. Live trip → tap opens it; otherwise the
 * next flight (or nothing) as the status line. Long-press for mute/leave. */
function FollowingRow({ person }: { person: Following }) {
  const theme = useTheme();
  const router = useRouter();
  const setMuted = useMutation(api.circle.setMuted);
  const leave = useMutation(api.circle.leave);

  const live = person.live;
  const stage = (live?.session.currentStage as TravelStage | null) ?? null;
  let status: string;
  let statusColor: string = theme.textSecondary;
  if (live) {
    status = `${stage ? STAGE_LABELS[stage] : 'Flying soon'} · ${live.session.fromCode} → ${live.session.toCode}`;
    if (live.session.delayMinutes != null && live.session.delayMinutes >= 30)
      status += ` · ${live.session.delayMinutes} min late`;
    else if (live.session.gate) status += ` · Gate ${live.session.gate}`;
    statusColor = theme.tint;
  } else if (person.next) {
    status = `Flies ${person.next.fromCode} → ${person.next.toCode} · ${formatDayLabel(person.next.scheduledDeparture)}`;
  } else {
    status = 'No upcoming trips';
  }

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

  const flight = live?.session ?? person.next;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        live?.token
          ? router.push({ pathname: '/trip/[token]', params: { token: live.token } })
          : actions()
      }
      onLongPress={actions}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={[styles.row, styles.card]}>
        <Avatar name={person.name} imageUrl={person.imageUrl} size={44} />
        <View style={styles.rowBody}>
          <ThemedText themeColor="heading" numberOfLines={1}>
            {person.name}
          </ThemedText>
          <ThemedText type="small" numberOfLines={1} style={{ color: statusColor }}>
            {status}
          </ThemedText>
        </View>
        {flight && <AirlineLogo number={flight.number} carrier={flight.carrier} size={28} />}
        {person.muted ? (
          <SymbolView
            name={{ ios: 'bell.slash', android: 'notifications_off', web: 'notifications_off' }}
            size={16}
            tintColor={theme.textSecondary}
          />
        ) : live ? (
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={14}
            weight="bold"
            tintColor={theme.textSecondary}
          />
        ) : null}
      </ThemedView>
    </Pressable>
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
      <ThemedView type="backgroundElement" style={[styles.row, styles.card]}>
        <Avatar name={person.name} imageUrl={person.imageUrl} size={44} />
        <View style={styles.rowBody}>
          <ThemedText themeColor="heading" numberOfLines={1}>
            {person.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            Gets your travel-day updates
          </ThemedText>
        </View>
        <SymbolView
          name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
          size={18}
          tintColor={theme.textSecondary}
        />
      </ThemedView>
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
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
  addCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footnote: {
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
  },
  pressed: {
    opacity: 0.9,
  },
  empty: {
    gap: Spacing.three,
    padding: Spacing.four,
  },
  emptyAvatars: {
    flexDirection: 'row',
    alignSelf: 'center',
  },
  emptyAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
});
