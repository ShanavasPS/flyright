import { useAuth } from '@clerk/expo';
import { useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { api } from '../../convex/_generated/api';

import { Avatar } from '@/components/avatar';
import { PrimaryButton } from '@/components/primary-button';
import { RouteLeg } from '@/components/route-leg';
import { ThemedText } from '@/components/themed-text';
import { TravelDayTimeline } from '@/components/travel-day-timeline';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { compactLiveView } from '@/services/connections';
import { railStatus, type RailStatus } from '@/services/following-rail';
import { adaptPublicSession, movedClocks, onHomeScreen, tripDone } from '@/services/public-session';
import { agoLabel, captionOf } from '@/services/trip-updates';

type Entry = NonNullable<ReturnType<typeof useFollowing>>[number];

const useFollowing = () => {
  const { isSignedIn } = useAuth();
  return useQuery(api.live.following, isSignedIn ? {} : 'skip');
};

const FACE = 54;
const RING = 70;
const STROKE = 3.5;
const RADIUS = (RING - STROKE) / 2 - 1;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const COUNTDOWN_ICONS: Record<'takeoff' | 'landing', SymbolViewProps['name']> = {
  takeoff: { ios: 'airplane.departure', android: 'flight_takeoff', web: 'flight_takeoff' },
  landing: { ios: 'airplane.arrival', android: 'flight_land', web: 'flight_land' },
};

/** Live trips the user follows, at the top of My travels, as a row of faces:
 * the ring round each one fills as the trip goes (the airport walk, then the
 * flight), the word under the name is the one fact a follower is waiting on,
 * and a tap opens the trip's whole status — the leg and the stage timeline —
 * in a sheet, without leaving the traveller's own journal. However many
 * people are travelling, the rail is one row tall, so the traveller's own
 * trips keep their place on the screen. The query is reactive, so stages
 * land here without any refresh. Render only under CloudSync (Convex
 * configured). */
export function FollowingSection() {
  const router = useRouter();
  const theme = useTheme();
  const entries = useFollowing();
  const now = useNow();
  const [openId, setOpenId] = useState<string | null>(null);

  // The session lives 48h past arrival so late stamps still find it; the
  // home screen lets a landed trip go two hours after the landing.
  const live = entries?.filter(({ session, onward }) => onHomeScreen(session, now, onward)) ?? [];
  if (!live.length) return null;
  // Derived, not stored: a trip that leaves the list closes its sheet.
  const open = live.find((e) => e.sessionId === openId) ?? null;

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
        Following
      </ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        style={styles.railScroll}>
        {live.map((entry) => (
          <Face
            key={entry.sessionId}
            entry={entry}
            status={railStatus(entry.session, entry.onward, now)}
            headline={compactLiveView(entry.session, entry.onward, now).headline}
            onPress={() => setOpenId(entry.sessionId)}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See everyone you follow"
          testID="following-see-all"
          onPress={() => router.navigate({ pathname: '/people', params: { tab: 'following' } })}
          style={({ pressed }) => [styles.face, pressed && styles.pressed]}>
          <View style={[styles.more, { borderColor: theme.hairline }]}>
            <SymbolView
              name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
              size={20}
              tintColor={theme.textSecondary}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.name}>
            People
          </ThemedText>
        </Pressable>
      </ScrollView>
      <TripSheet
        entry={open}
        now={now}
        onClose={() => setOpenId(null)}
        onOpenPerson={(id) => {
          setOpenId(null);
          router.push({ pathname: '/person/[id]', params: { id } });
        }}
      />
    </View>
  );
}

function Face({
  entry,
  status,
  headline,
  onPress,
}: {
  entry: Entry;
  status: RailStatus;
  headline: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color =
    status.tone === 'late' ? theme.warning : status.tone === 'done' ? theme.success : theme.tint;
  const first = entry.owner.name.split(' ')[0] || entry.owner.name;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.owner.name}: ${headline}`}
      accessibilityHint="Shows the trip's status"
      testID={`following-face-${entry.ownerId}`}
      onPress={onPress}
      style={({ pressed }) => [styles.face, pressed && styles.pressed]}>
      <View style={styles.ringBox}>
        <Svg width={RING} height={RING} style={styles.ringSvg}>
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            stroke={theme.hairline}
            strokeWidth={STROKE}
            fill="none"
          />
          {status.ring > 0 && (
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${CIRCUMFERENCE * status.ring} ${CIRCUMFERENCE}`}
              // From twelve o'clock, clockwise.
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          )}
        </Svg>
        <Avatar name={entry.owner.name} imageUrl={entry.owner.imageUrl} size={FACE} />
        {status.badge && (
          <View
            style={[
              styles.badge,
              status.badge.kind === 'gate' && styles.gateBadge,
              { backgroundColor: color, borderColor: theme.background },
            ]}>
            {status.badge.kind === 'gate' ? (
              <Text style={styles.gateText} numberOfLines={1}>
                {status.badge.gate}
              </Text>
            ) : (
              <SymbolView
                name={
                  status.badge.kind === 'plane'
                    ? { ios: 'airplane', android: 'flight', web: 'flight' }
                    : { ios: 'checkmark', android: 'check', web: 'check' }
                }
                size={11}
                weight="bold"
                tintColor="#FFFFFF"
              />
            )}
          </View>
        )}
      </View>
      <ThemedText type="smallBold" style={styles.name} numberOfLines={1}>
        {first}
      </ThemedText>
      <View style={styles.statusRow}>
        {status.icon && (
          <SymbolView name={COUNTDOWN_ICONS[status.icon]} size={11} tintColor={color} />
        )}
        <Text style={[styles.status, { color }]} numberOfLines={1}>
          {status.label}
        </Text>
      </View>
    </Pressable>
  );
}

/** A followed trip's whole status, over My travels: who, the one time fact
 * and what is happening around it, the leg with the plane where it is, the
 * traveller's latest word, and the stage timeline — the part a follower
 * used to scroll to the bottom of the trip page for. Their page (every leg,
 * every update) is one button further. */
function TripSheet({
  entry,
  now,
  onClose,
  onOpenPerson,
}: {
  entry: Entry | null;
  now: Date;
  onClose: () => void;
  onOpenPerson: (ownerId: string) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={!!entry}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      {/* Backdrop and card are siblings (see menu-sheet): a card inside a
          Pressable can't scroll on Android. */}
      <View style={styles.sheet}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} />
        {entry && (
          <Animated.View
            entering={SlideInDown.duration(260)}
            style={[
              styles.card,
              { backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, Spacing.three) },
            ]}>
            <SheetBody entry={entry} now={now} onClose={onClose} onOpenPerson={onOpenPerson} />
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

function SheetBody({
  entry,
  now,
  onClose,
  onOpenPerson,
}: {
  entry: Entry;
  now: Date;
  onClose: () => void;
  onOpenPerson: (ownerId: string) => void;
}) {
  const theme = useTheme();
  const { session, onward, owner, update } = entry;
  const view = compactLiveView(session, onward, now);
  const detail = [view.detail, view.layover].filter(Boolean).join(' · ') || null;
  const { journey, state, facts, plan } = adaptPublicSession(session);
  const connecting = view.leg.fromCode !== session.fromCode;
  const latest = update?.latest ?? null;
  const caption = latest ? captionOf(latest) : null;
  const first = owner.name.split(' ')[0] || owner.name;

  return (
    <>
      <View style={styles.sheetHeader}>
        <Avatar name={owner.name} imageUrl={owner.imageUrl} size={48} pro={owner.pro} />
        <View style={styles.sheetTitle}>
          <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1}>
            {owner.name} · {view.number || view.carrier}
          </ThemedText>
          <ThemedText
            themeColor="heading"
            style={[styles.headline, view.delayed && { color: theme.warning }]}>
            {view.headline}
          </ThemedText>
          {detail && (
            <ThemedText type="small" themeColor="textSecondary">
              {detail}
            </ThemedText>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          testID="following-sheet-close"
          hitSlop={Spacing.two}
          onPress={onClose}
          style={({ pressed }) => [
            styles.close,
            { backgroundColor: theme.field },
            pressed && styles.pressed,
          ]}>
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={14}
            weight="bold"
            tintColor={theme.textSecondary}
          />
        </Pressable>
      </View>
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetContent}
        showsVerticalScrollIndicator={false}>
        <RouteLeg
          progress={view.progress}
          yourTime
          leg={{ ...view.leg, ...(connecting ? {} : movedClocks(session)) }}
        />
        {view.connecting && (
          <ThemedText type="small" themeColor="textSecondary">
            {view.connecting}
          </ThemedText>
        )}
        {latest && caption && (
          <View style={[styles.update, { backgroundColor: theme.field }]}>
            <View style={styles.updateText}>
              <ThemedText type="small" numberOfLines={3}>
                {latest.text ? `“${caption}”` : caption}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {agoLabel(latest.createdAt, now)}
              </ThemedText>
            </View>
            {latest.photoUrl && (
              <Image
                source={{ uri: latest.photoUrl }}
                recyclingKey={latest.updateId}
                contentFit="cover"
                accessibilityIgnoresInvertColors
                style={styles.updatePhoto}
              />
            )}
          </View>
        )}
        {/* The landed leg's walk is history once the next leg is the story;
            the pass above already says where that one stands. */}
        {!(connecting && tripDone(session, now)) && (
          <TravelDayTimeline journey={journey} state={state} facts={facts} plan={plan} readOnly />
        )}
      </ScrollView>
      <PrimaryButton label={`See ${first}'s trips`} onPress={() => onOpenPerson(entry.ownerId)} />
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  title: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Full-bleed: the faces scroll to the screen's edge, not the list's
  // padding, and start in line with everything else.
  railScroll: {
    marginHorizontal: -Spacing.three,
  },
  rail: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  face: {
    width: 78,
    alignItems: 'center',
    gap: Spacing.half,
  },
  pressed: { opacity: 0.6 },
  ringBox: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateBadge: {
    paddingHorizontal: Spacing.one,
    right: -Spacing.one,
  },
  gateText: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: 800,
  },
  more: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    maxWidth: 78,
    textAlign: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: -Spacing.half,
  },
  status: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 700,
  },
  sheet: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    maxHeight: '88%',
    borderTopLeftRadius: Spacing.five - Spacing.one,
    borderTopRightRadius: Spacing.five - Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three + Spacing.one,
    gap: Spacing.three,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  sheetTitle: {
    flex: 1,
    gap: Spacing.half,
  },
  headline: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 800,
  },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetContent: {
    gap: Spacing.three,
  },
  update: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  updateText: {
    flex: 1,
    gap: Spacing.half,
  },
  updatePhoto: {
    width: 56,
    height: 56,
    borderRadius: Spacing.two + 2,
  },
});
