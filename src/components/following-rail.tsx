import { useAuth } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

import { Avatar } from '@/components/avatar';
import { FlightFactsStrip } from '@/components/flight-facts';
import { PrimaryButton } from '@/components/primary-button';
import { RouteLeg } from '@/components/route-leg';
import { ThemedText } from '@/components/themed-text';
import { TravelDayTimeline } from '@/components/travel-day-timeline';
import { UpdatesCard } from '@/components/trip-updates';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { compactLiveView } from '@/services/connections';
import { railStatus, type RailStatus } from '@/services/following-rail';
import { adaptPublicSession, movedClocks, tripDone } from '@/services/public-session';
import { markUpdatesSeen, useIsUnseen } from '@/services/seen-updates';
import { agoLabel, captionOf, updateContext, type OwnUpdate, type TripUpdate } from '@/services/trip-updates';

/** One followed trip as `live.following` returns it. */
export type FollowingEntry = NonNullable<
  ReturnType<typeof useQuery<typeof api.live.following>>
>[number];

const FACE = 46;
const RING = 60;
const STROKE = 3;
const RADIUS = (RING - STROKE) / 2 - 1;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const TILE = 70;

const COUNTDOWN_ICONS: Record<'takeoff' | 'landing', SymbolViewProps['name']> = {
  takeoff: { ios: 'airplane.departure', android: 'flight_takeoff', web: 'flight_takeoff' },
  landing: { ios: 'airplane.arrival', android: 'flight_land', web: 'flight_land' },
};

/**
 * The people you follow who are travelling now, as a row of faces: the ring
 * round each one fills as the trip goes (the airport walk, then the
 * flight), the word under the name is the one fact a follower is waiting
 * on, and the corner says what they posted last — a thumbnail for a photo,
 * a bubble for a line, with a dot while it is new to this phone. A tap
 * opens the trip's whole status in a sheet. One row tall however many
 * people fly; My travels and the Friends tab draw the same rail.
 */
export function FollowingRail({
  title,
  entries,
  now,
  leading,
  trailing,
}: {
  /** A label over the faces; left out on Flights, where the faces and their
   * rings say what they are. */
  title?: string;
  entries: FollowingEntry[];
  now: Date;
  /** A tile before the faces — the traveller's own "You" tile. */
  leading?: ReactNode;
  /** The last tile: where the rest of your people are. */
  trailing?: { label: string; onPress: () => void };
}) {
  const router = useRouter();
  const theme = useTheme();
  const isUnseen = useIsUnseen();
  const [openId, setOpenId] = useState<string | null>(null);
  // Derived, not stored: a trip that leaves the list closes its sheet.
  const open = entries.find((e) => e.sessionId === openId) ?? null;

  return (
    <View style={styles.section}>
      {title && (
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
          {title}
        </ThemedText>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        style={styles.railScroll}>
        {leading}
        {entries.map((entry) => (
          <Face
            key={entry.sessionId}
            entry={entry}
            status={railStatus(entry.session, entry.onward, now)}
            headline={compactLiveView(entry.session, entry.onward, now).headline}
            fresh={!!entry.update && isUnseen(entry.update.latest.updateId)}
            onPress={() => setOpenId(entry.sessionId)}
          />
        ))}
        {trailing && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`See all ${trailing.label}`}
            testID="following-see-all"
            onPress={trailing.onPress}
            style={({ pressed }) => [styles.face, pressed && styles.pressed]}>
            <View style={[styles.more, { borderColor: theme.hairline }]}>
              <SymbolView
                name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
                size={20}
                tintColor={theme.textSecondary}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.name}>
              {trailing.label}
            </ThemedText>
          </Pressable>
        )}
      </ScrollView>
      <TripSheet
        entry={open}
        now={now}
        onClose={() => setOpenId(null)}
        onOpenPerson={(id) => {
          setOpenId(null);
          router.push({ pathname: '/person/[id]', params: { id } });
        }}
        onOpenTrip={(id, journeyId) => {
          setOpenId(null);
          // Their trip in the Friends tab, scrolled to what they shared.
          router.push({ pathname: '/person/[id]/trip/[journeyId]', params: { id, journeyId, focus: 'posts' } });
        }}
      />
    </View>
  );
}

/** The ring: a hairline track and the filled share, from twelve o'clock. */
function Ring({ fill, color, dashed = false }: { fill: number; color: string; dashed?: boolean }) {
  const theme = useTheme();
  return (
    <Svg width={RING} height={RING} style={styles.ringSvg}>
      <Circle
        cx={RING / 2}
        cy={RING / 2}
        r={RADIUS}
        stroke={dashed ? color : theme.hairline}
        strokeWidth={dashed ? 2 : STROKE}
        strokeDasharray={dashed ? '5 5' : undefined}
        fill="none"
      />
      {!dashed && fill > 0 && (
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={RADIUS}
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE * fill} ${CIRCUMFERENCE}`}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      )}
    </Svg>
  );
}

/** Top-left of a face: the last thing posted, a thumbnail or a bubble, and
 * a dot while it is new here. */
function UpdateMark({ update, fresh }: { update: TripUpdate; fresh: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.markBox} pointerEvents="none">
      {update.photoUrl ? (
        <Image
          source={{ uri: update.photoUrl }}
          recyclingKey={update.updateId}
          contentFit="cover"
          accessibilityIgnoresInvertColors
          style={[styles.markPhoto, { borderColor: theme.background }]}
        />
      ) : (
        <View style={[styles.markBubble, { backgroundColor: theme.backgroundElement }]}>
          <SymbolView
            name={{ ios: 'text.bubble.fill', android: 'chat_bubble', web: 'chat_bubble' }}
            size={12}
            tintColor={theme.tint}
          />
        </View>
      )}
      {fresh && (
        <View style={[styles.freshDot, { backgroundColor: theme.tint, borderColor: theme.background }]} />
      )}
    </View>
  );
}

function Face({
  entry,
  status,
  headline,
  fresh,
  onPress,
}: {
  entry: FollowingEntry;
  status: RailStatus;
  headline: string;
  fresh: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color =
    status.tone === 'late' ? theme.warning : status.tone === 'done' ? theme.success : theme.tint;
  const first = entry.owner.name.split(' ')[0] || entry.owner.name;
  const latest = entry.update?.latest ?? null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.owner.name}: ${headline}${fresh ? ', new update' : ''}`}
      accessibilityHint="Shows the trip's status"
      testID={`following-face-${entry.ownerId}`}
      onPress={onPress}
      style={({ pressed }) => [styles.face, pressed && styles.pressed]}>
      <View style={styles.ringBox}>
        <Ring fill={status.ring} color={color} />
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
        {latest && <UpdateMark update={latest} fresh={fresh} />}
      </View>
      <ThemedText type="smallBold" style={styles.name} numberOfLines={1}>
        {first}
      </ThemedText>
      <View style={styles.statusRow}>
        {status.icon && <SymbolView name={COUNTDOWN_ICONS[status.icon]} size={11} tintColor={color} />}
        <Text style={[styles.status, { color }]} numberOfLines={1}>
          {status.label}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * The traveller's own tile, first on the rail while their trip takes
 * updates: a dashed ring and a plus until they post, then their latest
 * post in the corner and the hearts it has had. A tap opens the composer.
 */
export function YouTile({
  name,
  imageUrl,
  latest,
  hearts,
  onPress,
}: {
  name: string;
  imageUrl: string | null;
  latest: TripUpdate | null;
  hearts: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={latest ? `Your updates, ${hearts} hearts. Share another` : 'Share an update from your trip'}
      testID="following-you"
      onPress={onPress}
      style={({ pressed }) => [styles.face, pressed && styles.pressed]}>
      <View style={styles.ringBox}>
        <Ring fill={1} color={theme.tint} dashed={!latest} />
        <Avatar name={name} imageUrl={imageUrl} size={FACE} />
        <View style={[styles.badge, { backgroundColor: theme.tint, borderColor: theme.background }]}>
          <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={11} weight="bold" tintColor="#FFFFFF" />
        </View>
        {latest && <UpdateMark update={latest} fresh={false} />}
      </View>
      <ThemedText type="smallBold" style={styles.name} numberOfLines={1}>
        You
      </ThemedText>
      {/* Nothing posted yet says nothing: the + on the ring is the invitation,
          and a word under it only repeated the tap it sits on. */}
      {!!latest && (
        <View style={styles.statusRow}>
          {hearts > 0 ? (
            <>
              <SymbolView name={{ ios: 'heart.fill', android: 'favorite', web: 'favorite' }} size={11} tintColor={theme.danger} />
              <Text style={[styles.status, { color: theme.danger }]}>{hearts}</Text>
            </>
          ) : (
            <Text style={[styles.status, { color: theme.tint }]}>Posted</Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

/**
 * Your own posts from today's trip, from the rail's You tile: each with who
 * has hearted it (a tap lists them; a long press takes it down), and the
 * way to share another. The traveller's side of what their followers see.
 */
export function MyUpdatesSheet({
  visible,
  tripLine,
  updates,
  now,
  onRemove,
  onCompose,
  onClose,
}: {
  visible: boolean;
  /** "AY1337 · HEL → LHR" */
  tripLine: string;
  updates: OwnUpdate[];
  now: Date;
  onRemove: (updateId: string) => void;
  onCompose: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.sheet}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} />
        {visible && (
          <Animated.View
            entering={SlideInDown.duration(260)}
            style={[
              styles.card,
              { backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, Spacing.three) },
            ]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitle}>
                <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1}>
                  {tripLine}
                </ThemedText>
                <ThemedText themeColor="heading" style={styles.headline}>
                  Your updates
                </ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                testID="my-updates-close"
                hitSlop={Spacing.two}
                onPress={onClose}
                style={({ pressed }) => [styles.close, { backgroundColor: theme.field }, pressed && styles.pressed]}>
                <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={14} weight="bold" tintColor={theme.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
              <UpdatesCard eyebrow={`Posted · ${updates.length}`} updates={updates} now={now} onRemove={onRemove} />
            </ScrollView>
            <PrimaryButton label="Share another" onPress={onCompose} />
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

/** A followed trip's whole status, over the screen: who and the one time
 * fact, the leg with the plane where it is, what they posted (newest
 * first, hearts on each), and the stage timeline folded to one line — the
 * part a follower used to scroll to the bottom of the trip page for. */
function TripSheet({
  entry,
  now,
  onClose,
  onOpenPerson,
  onOpenTrip,
}: {
  entry: FollowingEntry | null;
  now: Date;
  onClose: () => void;
  onOpenPerson: (ownerId: string) => void;
  onOpenTrip: (ownerId: string, journeyId: string) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!entry} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
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
            <SheetBody
              key={entry.sessionId}
              entry={entry}
              now={now}
              onClose={onClose}
              onOpenPerson={onOpenPerson}
              onOpenTrip={onOpenTrip}
            />
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
  onOpenTrip,
}: {
  entry: FollowingEntry;
  now: Date;
  onClose: () => void;
  onOpenPerson: (ownerId: string) => void;
  onOpenTrip: (ownerId: string, journeyId: string) => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  // Where the travel-day row sits in the sheet, and whether opening it
  // still owes a scroll: the timeline lays out below the fold, so the sheet
  // brings it up once its height is known.
  const foldY = useRef(0);
  const revealTimeline = useRef(false);
  const { isSignedIn } = useAuth();
  const { session, onward, owner } = entry;
  const detailQuery = useQuery(api.live.byFollow, isSignedIn ? { sessionId: entry.sessionId as Id<'liveSessions'> } : 'skip');
  const react = useMutation(api.updates.react);
  const view = compactLiveView(session, onward, now);
  const detail = [view.detail, view.layover].filter(Boolean).join(' · ') || null;
  const { journey, state, facts, plan } = adaptPublicSession(session);
  const connecting = view.leg.fromCode !== session.fromCode;
  const first = owner.name.split(' ')[0] || owner.name;
  // Everything they posted on this trip once the full session has loaded;
  // until then the one the rail already had.
  const updates: TripUpdate[] =
    detailQuery && !('gone' in detailQuery) && !('hidden' in detailQuery)
      ? (detailQuery.updates ?? [])
      : entry.update
        ? [entry.update.latest]
        : [];

  // Looking is what clears the mark on the face.
  const seenKey = updates.map((u) => u.updateId).join(',');
  useEffect(() => {
    if (seenKey) markUpdatesSeen(seenKey.split(','));
  }, [seenKey]);

  const report = (updateId: string) =>
    Alert.alert('Report this update?', 'Tell us what is wrong with it. The person who posted it will not know.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: () => {
          onClose();
          router.push({ pathname: '/report', params: { name: owner.name, updateId } });
        },
      },
    ]);


  return (
    <>
      <View style={styles.sheetHeader}>
        <Avatar name={owner.name} imageUrl={owner.imageUrl} size={48} pro={owner.pro} />
        <View style={styles.sheetTitle}>
          <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1}>
            {owner.name} · {view.number || view.carrier}
          </ThemedText>
          <ThemedText themeColor="heading" style={[styles.headline, view.delayed && { color: theme.warning }]}>
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
          style={({ pressed }) => [styles.close, { backgroundColor: theme.field }, pressed && styles.pressed]}>
          <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={14} weight="bold" tintColor={theme.textSecondary} />
        </Pressable>
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          if (!revealTimeline.current) return;
          revealTimeline.current = false;
          scrollRef.current?.scrollTo({ y: foldY.current, animated: true });
        }}>
        <RouteLeg progress={view.progress} yourTime leg={{ ...view.leg, ...(connecting ? {} : movedClocks(session)) }} />
        {view.connecting && (
          <ThemedText type="small" themeColor="textSecondary">
            {view.connecting}
          </ThemedText>
        )}
        {/* Gate and terminal stay in sight while the steps are folded. */}
        {!connecting && (
          <FlightFactsStrip
            facts={facts}
            stage={state.stage}
            departureZone={airportZone(session.fromCode)}
            tracked={session.flightStatus !== null}
          />
        )}
        {updates.length > 0 && (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
              From {first} · {updates.length}
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.postsScroll}
              contentContainerStyle={styles.posts}>
              {updates.map((u) => (
                <PostCard
                  key={u.updateId}
                  update={u}
                  now={now}
                  onReact={isSignedIn ? () => void react({ updateId: u.updateId as Id<'tripUpdates'> }) : undefined}
                  onReport={() => report(u.updateId)}
                  onOpenPhoto={
                    entry.journeyId ? () => onOpenTrip(entry.ownerId, entry.journeyId as string) : undefined
                  }
                />
              ))}
            </ScrollView>
          </>
        )}
        {/* The landed leg's walk is history once the next leg is the story. */}
        {!(connecting && tripDone(session, now)) && (
          <>
            <View
              onLayout={(e) => {
                foldY.current = e.nativeEvent.layout.y;
              }}>
              {/* Shut each time the sheet opens: the posts and the leg lead,
                  the steps are a tap away. */}
              <TravelDayTimeline
                journey={journey}
                state={state}
                facts={facts}
                plan={plan}
                readOnly
                defaultOpen={false}
                onToggle={(open) => {
                  revealTimeline.current = open;
                }}
              />
            </View>
          </>
        )}
      </ScrollView>
      <PrimaryButton label={`See ${first}'s trips`} onPress={() => onOpenPerson(entry.ownerId)} />
    </>
  );
}

/** One post in the sheet's strip: the photo (or the line as the card),
 * where they were and when, and the heart. Long press reports it. */
function PostCard({
  update,
  now,
  onReact,
  onReport,
  onOpenPhoto,
}: {
  update: TripUpdate;
  now: Date;
  onReact?: () => void;
  onReport: () => void;
  /** The photo opens the trip it came from, where the rest of it is. */
  onOpenPhoto?: () => void;
}) {
  const theme = useTheme();
  const meta = [updateContext(update), agoLabel(update.createdAt, now)].filter(Boolean).join(' · ');
  const caption = captionOf(update);
  return (
    <Pressable
      accessibilityLabel={`${caption}, ${meta}`}
      accessibilityHint="Long press to report"
      onLongPress={onReport}
      delayLongPress={400}
      style={[
        styles.post,
        update.photoUrl ? styles.photoPost : [styles.textPost, { backgroundColor: theme.field }],
        { borderColor: theme.hairline },
      ]}>
      {update.photoUrl && (
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel="Open this trip"
          disabled={!onOpenPhoto}
          onPress={onOpenPhoto}
          onLongPress={onReport}
          delayLongPress={400}
          style={({ pressed }) => pressed && styles.pressed}>
          <Image
            source={{ uri: update.photoUrl }}
            recyclingKey={update.updateId}
            contentFit="cover"
            transition={150}
            accessibilityIgnoresInvertColors
            style={[styles.postPhoto, { backgroundColor: theme.field }]}
          />
        </Pressable>
      )}
      <View style={styles.postBody}>
        {update.text ? (
          <ThemedText type={update.photoUrl ? 'small' : 'default'} numberOfLines={update.photoUrl ? 2 : 5}>
            {update.text}
          </ThemedText>
        ) : null}
        <View style={styles.postMeta}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.postMetaText}>
            {meta}
          </ThemedText>
          {onReact && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={update.reacted ? 'Remove your heart' : 'Send a heart'}
              accessibilityState={{ selected: update.reacted }}
              hitSlop={Spacing.two}
              onPress={onReact}
              style={({ pressed }) => [
                styles.heart,
                { backgroundColor: update.reacted ? `${theme.danger}1A` : theme.backgroundElement },
                pressed && styles.pressed,
              ]}>
              <SymbolView
                name={
                  update.reacted
                    ? { ios: 'heart.fill', android: 'favorite', web: 'favorite' }
                    : { ios: 'heart', android: 'favorite_border', web: 'favorite_border' }
                }
                size={14}
                tintColor={update.reacted ? theme.danger : theme.textSecondary}
              />
              {update.reactions > 0 && (
                <ThemedText type="small" themeColor={update.reacted ? 'danger' : 'textSecondary'}>
                  {update.reactions}
                </ThemedText>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
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
    // Room for the update mark, which sits above the ring's top edge — two
    // points, not four: the rail sits directly under the day line and every
    // point above the first face reads as the header drifting away from it.
    paddingTop: Spacing.half,
    gap: Spacing.two,
  },
  face: {
    width: TILE,
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
    minWidth: 20,
    height: 20,
    borderRadius: 10,
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
  markBox: {
    position: 'absolute',
    left: -Spacing.one,
    top: -Spacing.one,
  },
  markPhoto: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
  },
  markBubble: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B1424',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  freshDot: {
    position: 'absolute',
    right: -4,
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
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
    maxWidth: TILE,
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
  postsScroll: {
    marginHorizontal: -Spacing.three,
    marginTop: -Spacing.two,
  },
  posts: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two + Spacing.one,
  },
  post: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  photoPost: {
    width: 220,
  },
  textPost: {
    width: 200,
    minHeight: 150,
  },
  postPhoto: {
    width: '100%',
    height: 150,
  },
  postBody: {
    flex: 1,
    padding: Spacing.two + Spacing.one,
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  postMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  postMetaText: {
    flex: 1,
  },
  heart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    height: 28,
    paddingHorizontal: Spacing.two,
    borderRadius: 14,
  },
});
