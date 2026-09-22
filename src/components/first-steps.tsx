import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { GhostUpdates } from '@/components/ghost-trips';
import { MicroLabel, PassAction, PassCard, PassDivider } from '@/components/pass-card';
import { ThemedText } from '@/components/themed-text';
import { MiniContrail, WHITE, WHITE_DIM } from '@/components/travel-stats-header';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { formatDayLabel } from '@/services/dates';
import { cityOf } from '@/services/timeline';

/** The pieces Updates stands in with when it has no postcards to show:
 * signed out, a first follow, a request, a quiet day. Updates decides which
 * (screens/updates.tsx). Every one of them is about other people — your own
 * flights, and the button that adds one, are on Flights. */

/** Somebody on one of these cards, and the page their face opens. */
export type Person = {
  userId: string;
  name: string;
  imageUrl: string | null;
  /** Their next trip, when the seat can see one — the line under the strip. */
  next?: { fromCode: string; toCode: string; scheduledDeparture: string } | null;
};

/** Signed in, following nobody and followed by nobody. Updates is where
 * other people's flights run, so the one thing that fills it is a follow —
 * the pass shows what it will hold (faces over a postcard) and asks for
 * exactly that. Adding a flight is not offered: it fills Flights, not this. */
export function GetStarted({ onFindPeople }: { onFindPeople: () => void }) {
  return (
    <PassCard>
      <View style={styles.welcomeTop}>
        <MicroLabel>Your friends</MicroLabel>
        <MiniContrail />
      </View>
      <GhostUpdates />
      <View style={styles.welcomeCopy}>
        <Text style={styles.welcomeHeadline}>Follow a friend’s flights.</Text>
        <Text style={styles.welcomePitch}>
          Their gate, take-off and landing show up here as they happen, with the postcards they
          send on the way.
        </Text>
      </View>
      <PassDivider />
      <PassAction
        label="Find or invite a friend"
        onPress={onFindPeople}
        icon={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }}
      />
    </PassCard>
  );
}

/** A follow with one end still open, on the pass the rest of Home uses.
 *
 * The two faces are the point: this is about a person, not a task, so it
 * shows them — theirs lit once they have done their part, yours once you
 * have. And when it is YOUR move it is answered here instead of pointing at
 * another tab; the mutation is the one Friends already calls. When the move
 * is theirs there is nothing to press, so nothing pretends to be pressable. */
export function PendingFollow({
  id,
  name,
  imageUrl,
  waitingOnMe,
  follow,
  me,
  onAnswer,
}: {
  id: string;
  name: string;
  imageUrl: string | null;
  waitingOnMe: boolean;
  follow: boolean;
  me: { name: string; imageUrl: string | null };
  onAnswer: (requestId: string, accept: boolean) => void;
}) {
  const router = useRouter();
  const first = name.split(' ')[0];
  const headline = waitingOnMe
    ? follow
      ? `${first} wants to follow you.`
      : `${first} invited you.`
    : `Waiting on ${first}.`;
  const line = waitingOnMe
    ? follow
      ? 'They will see your gate, your delays and your landing. Nothing else.'
      : 'Say yes and their travel days show up here.'
    : 'You will know the moment they say yes.';
  // Shown over everything else on Updates while it waits on you, so it is
  // answered where the circle's news is — not only when the tab is empty.

  return (
    <PassCard>
      <View style={styles.welcomeTop}>
        <MicroLabel>{waitingOnMe ? 'Waiting on you' : 'Asked'}</MicroLabel>
        <MiniContrail />
      </View>

      <View style={styles.faces}>
        <Face name={me.name} imageUrl={me.imageUrl} lit={!waitingOnMe} label="You" />
        <View style={styles.thread} />
        <Face name={name} imageUrl={imageUrl} lit={waitingOnMe} label={first} />
      </View>

      <View style={styles.welcomeCopy}>
        <Text style={styles.welcomeHeadline}>{headline}</Text>
        <Text style={styles.welcomePitch}>{line}</Text>
      </View>

      <PassDivider />
      {waitingOnMe ? (
        <View style={styles.pair}>
          <PassAction
            label="Let them follow"
            onPress={() => onAnswer(id, true)}
            icon={{ ios: 'checkmark', android: 'check', web: 'check' }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => onAnswer(id, false)}
            style={({ pressed }) => [styles.quietAction, pressed && styles.pressed]}>
            <Text style={styles.quietLabel}>Not now</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/people')}
          style={({ pressed }) => [styles.quietAction, pressed && styles.pressed]}>
          <Text style={styles.quietLabel}>See who you asked</Text>
        </Pressable>
      )}
    </PassCard>
  );
}

/** The ordinary day: the people you follow in a strip that says plainly
 * that none of them is up, and who leaves next. The postcards' placeholder
 * goes under it (EmptyPostcards). */
export function FriendsStrip({
  people,
  onOpenPerson,
  onOpenFriends,
  someoneFlying = false,
}: {
  people: Person[];
  onOpenPerson: (userId: string) => void;
  onOpenFriends: () => void;
  /** Someone you follow is in the air (the wide Updates panel shows their
   * pass above this card): drop the "Nobody is flying right now" line. */
  someoneFlying?: boolean;
}) {
  const theme = useTheme();
  // Whoever leaves first, of everyone whose next trip this seat can see.
  const soonest = people
    .flatMap((p) => (p.next ? [{ who: p.name.split(' ')[0], trip: p.next }] : []))
    .sort((a, b) => a.trip.scheduledDeparture.localeCompare(b.trip.scheduledDeparture))[0];
  return (
    <>
      {/* Label, link, faces and the next departure are one card. The label
          is a caption at the spec's size — 11pt, wide-tracked, secondary —
          not a heading: it names the box, it is not the point of it. The
          link sits on its row inside the border, where it belongs to the
          thing it opens rather than floating above it. */}
      <View style={[styles.friendsCard, { borderColor: theme.hairline }]}>
        <View style={styles.sectionRow}>
          <Text style={[styles.caption, { color: theme.textSecondary }]}>YOUR FRIENDS</Text>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={onOpenFriends}
            style={({ pressed }) => pressed && styles.pressed}>
            <Text style={[styles.cardLink, { color: theme.tint }]}>Friends</Text>
          </Pressable>
        </View>

        <View style={styles.strip}>
          <View style={styles.stack}>
            {people.slice(0, 3).map((p, n) => (
              <Pressable
                key={p.userId}
                accessibilityRole="button"
                accessibilityLabel={`Open ${p.name}`}
                onPress={() => onOpenPerson(p.userId)}
                style={({ pressed }) => [
                  n > 0 && styles.overlap,
                  { borderColor: theme.background },
                  styles.stacked,
                  pressed && styles.pressed,
                ]}>
                <Avatar name={p.name} imageUrl={p.imageUrl} size={38} />
              </Pressable>
            ))}
            {people.length > 3 && (
              <View
                style={[
                  styles.overlap,
                  styles.stacked,
                  styles.more,
                  { borderColor: theme.background, backgroundColor: theme.backgroundSelected },
                ]}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  +{people.length - 3}
                </ThemedText>
              </View>
            )}
          </View>
          {!someoneFlying && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.stripLine}>
              {/* One friend is a person, not a crowd: "Nobody" over a single
                  face reads oddly, so name them. */}
              {people.length === 1
                ? `${people[0].name.split(' ')[0]} isn’t flying right now`
                : 'Nobody is flying right now'}
            </ThemedText>
          )}
        </View>

        {/* Not "nothing", then: the next one of them to leave, named. The
            quiet day carries facts, not an apology for having none. */}
        {soonest && (
          <View style={[styles.nextRow, { borderTopColor: theme.hairline }]}>
            <SymbolView
              name={{ ios: 'airplane.departure', android: 'flight_takeoff', web: 'flight_takeoff' }}
              size={15}
              tintColor={theme.textSecondary}
            />
            <ThemedText type="small" themeColor="textSecondary" style={styles.stripLine}>
              {soonest.who} flies to {cityOf(soonest.trip.toCode)} on{' '}
              {formatDayLabel(soonest.trip.scheduledDeparture, airportZone(soonest.trip.fromCode))}
            </ThemedText>
          </View>
        )}
      </View>

    </>
  );
}

/** Somebody follows you, and you follow nobody — so Home has nothing to put
 * on itself however many of them there are. The asymmetry is the thing to
 * say — they can see your days, you cannot see theirs — and saying it about
 * these particular people beats stating the rule at them. With one follower
 * it is also a thing to do, right here. */
export function HasFollower({
  people,
  onOpenPerson,
  onFollowBack,
  onOpenFriends,
}: {
  people: Person[];
  onOpenPerson: (userId: string) => void;
  onFollowBack: (userId: string) => void;
  onOpenFriends: () => void;
}) {
  const one = people.length === 1;
  const first = people[0].name.split(' ')[0];
  return (
    <PassCard>
      <View style={styles.welcomeTop}>
        <MicroLabel>{one ? 'Your first follower' : 'Following you'}</MicroLabel>
        <MiniContrail />
      </View>
      <FaceRow people={people} onOpenPerson={onOpenPerson} />
      <View style={styles.welcomeCopy}>
        <Text style={styles.welcomeHeadline}>
          {one ? `${first} is following you.` : `${people.length} people follow you.`}
        </Text>
        <Text style={styles.welcomePitch}>
          {one
            ? `${first} sees your travel days. Follow back to see theirs.`
            : 'They see your travel days. Follow back to see theirs.'}
        </Text>
      </View>
      <PassDivider />
      {one ? (
        <PassAction
          label={`Follow ${first} back`}
          onPress={() => onFollowBack(people[0].userId)}
          icon={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }}
        />
      ) : (
        <PassAction
          label="Choose who to follow back"
          onPress={onOpenFriends}
          icon={{ ios: 'person.2', android: 'group', web: 'group' }}
        />
      )}
    </PassCard>
  );
}

/** Up to four faces in a row, the way the rail draws them — and each one
 * opens that person, which is what a face is for. */
function FaceRow({
  people,
  onOpenPerson,
}: {
  people: Person[];
  onOpenPerson: (userId: string) => void;
}) {
  return (
    <View style={styles.faceRow}>
      {people.slice(0, 4).map((p) => (
        <Pressable
          key={p.userId}
          accessibilityRole="button"
          accessibilityLabel={`Open ${p.name}`}
          onPress={() => onOpenPerson(p.userId)}
          style={({ pressed }) => [styles.faceCell, pressed && styles.pressed]}>
          <View style={[styles.faceRing, styles.faceLit]}>
            <Avatar name={p.name} imageUrl={p.imageUrl} size={52} />
          </View>
          <Text style={styles.faceLabel} numberOfLines={1}>
            {p.name.split(' ')[0]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** One end of the link: a real face, lit when that side has done its part. */
function Face({
  name,
  imageUrl,
  lit,
  label,
}: {
  name: string;
  imageUrl: string | null;
  lit: boolean;
  label: string;
}) {
  return (
    <View style={styles.faceCell}>
      <View style={[styles.faceRing, lit ? styles.faceLit : styles.faceOpen]}>
        <Avatar name={name} imageUrl={imageUrl} size={52} />
      </View>
      <Text style={styles.faceLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}


const RING = 56;

/** Signed out, on Updates. The tab is the postcards friends send from their
 * trips, and both reading and sending them need an account (the circle is
 * signed-in only), so the pass shows a postcard and asks for the sign-in. Your own flights need none of it — they
 * are on Flights, on this phone. */
export function UpdatesWelcome({ onSignIn }: { onSignIn: () => void }) {
  return (
    <PassCard>
      <View style={styles.welcomeTop}>
        <MicroLabel>Postcards</MicroLabel>
        <MiniContrail />
      </View>
      <GhostUpdates />
      <View style={styles.welcomeCopy}>
        <Text style={styles.welcomeHeadline}>Postcards from your friends.</Text>
        <Text style={styles.welcomePitch}>
          A photo from the gate, a line from the window seat, the first evening away — sent as
          they travel. Sign in to invite your friends, see theirs and send your own.
        </Text>
      </View>
      <PassDivider />
      {/* Says what the sign-in is for: the invite comes straight after it. */}
      <PassAction
        label="Sign in and invite friends"
        onPress={onSignIn}
        icon={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }}
      />
    </PassCard>
  );
}

/** No postcards to show: a light, dashed postcard shape where they will land.
 * Deliberately not another navy pass — those ask for something; this only
 * marks the space, so it reads as a place rather than a prompt. */
export function EmptyPostcards({ line }: { line: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.emptyPost, { borderColor: theme.hairline }]}>
      <View
        style={styles.emptyHead}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <View style={[styles.emptyFace, { backgroundColor: theme.backgroundSelected }]} />
        <View style={styles.emptyBars}>
          <View style={[styles.emptyBar, { width: '40%', backgroundColor: theme.backgroundSelected }]} />
          <View style={[styles.emptyBar, { width: '65%', backgroundColor: theme.backgroundElement }]} />
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {line}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  meter: { letterSpacing: 1 },
  // The journal's empty hero sets the scale for a first screen: a headline
  // in the mid-twenties over a 14pt line, not a 32pt title.
  headline: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  actions: { gap: Spacing.two, marginTop: Spacing.two },
  pair: { gap: Spacing.two },
  faces: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.one },
  faceRow: { flexDirection: 'row', gap: Spacing.three, paddingTop: Spacing.one },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  caption: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.2 },
  cardLink: { fontSize: 13, lineHeight: 16, fontWeight: '700' },
  friendsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  strip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  stack: { flexDirection: 'row' },
  stacked: { borderRadius: 999, borderWidth: 2 },
  overlap: { marginLeft: -10 },
  more: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  stripLine: { flex: 1 },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  faceCell: { alignItems: 'center', gap: Spacing.one },
  faceRing: { padding: 3, borderRadius: 999, borderWidth: 2 },
  faceLit: { borderColor: '#2FD68C' },
  faceOpen: { borderColor: 'rgba(242,246,251,0.28)', borderStyle: 'dashed' },
  faceLabel: { color: WHITE_DIM, fontSize: 13, fontWeight: '600', maxWidth: 96 },
  thread: {
    flex: 1,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(242,246,251,0.28)',
    marginBottom: Spacing.four,
  },
  quietAction: { alignItems: 'center', paddingVertical: Spacing.two },
  quietLabel: { color: WHITE_DIM, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  secondary: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
  },
  secondaryLabel: { fontSize: 16, lineHeight: 20, fontWeight: '600' },
  link_: { paddingTop: Spacing.one },
  welcomeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // No padding of its own: PassCard already puts Spacing.three between its
  // children, and adding to it stacked 40pt above the headline and 40 below
  // — most of a small phone's screen spent on nothing.
  welcomeCopy: { gap: Spacing.two },
  welcomeHeadline: { color: WHITE, fontSize: 26, lineHeight: 32, fontWeight: '700' },
  welcomePitch: { color: WHITE_DIM, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  link: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.three },
  end: { alignItems: 'center', gap: Spacing.one },
  ring: { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2 },
  line: { flex: 1, borderTopWidth: 2, marginBottom: Spacing.four },
  dashed: { borderStyle: 'dashed' },
  pressed: { opacity: 0.7 },
  emptyPost: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Spacing.three + 2,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  emptyHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  emptyFace: { width: 32, height: 32, borderRadius: 16 },
  emptyBars: { flex: 1, gap: Spacing.one + Spacing.half },
  emptyBar: { height: 8, borderRadius: 4 },
});
