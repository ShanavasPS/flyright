import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { GhostTravelDay } from '@/components/ghost-trips';
import { MicroLabel, PassAction, PassCard, PassDivider } from '@/components/pass-card';
import { ThemedText } from '@/components/themed-text';
import { MiniContrail, WHITE, WHITE_DIM } from '@/components/travel-stats-header';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { formatDayLabel } from '@/services/dates';
import { cityOf } from '@/services/timeline';

/** The two steps Home opens on until both are done: sign in, then follow
 * somebody. Nothing else belongs here — adding a flight lives on Flights,
 * and a delay is not something a person can go and complete.
 *
 * Drawn as one unmade connection rather than a checklist. A two-item list
 * looks trivial; a link with one end missing does the asking by itself, so
 * the words underneath stay few. A follow genuinely needs both ends: the
 * circle is signed-in only (convex/circle.ts requires an identity to invite,
 * accept or be asked), which is what step 1 is for. */
/** Somebody on one of these cards, and the page their face opens. */
type Person = {
  userId: string;
  name: string;
  imageUrl: string | null;
  /** Their next trip, when the seat can see one — the line under the strip. */
  next?: { fromCode: string; toCode: string; scheduledDeparture: string } | null;
};

export function FirstSteps({
  signedIn,
  pending,
  following,
  followers,
  me,
  onAnswer,
  onOpenPerson,
  onFollowBack,
}: {
  signedIn: boolean;
  /** A follow half made and waiting on somebody — an invitation either way
   * round, or a request to follow. Null when there is none, which is the
   * ordinary empty Home. */
  pending: {
    id: string;
    name: string;
    imageUrl: string | null;
    waitingOnMe: boolean;
    follow: boolean;
  } | null;
  /** People you follow, and people who follow you. Either one changes what
   * an empty Home should say. */
  following: Person[];
  followers: Person[];
  /** The viewer, for the near end of the link. */
  me: { name: string; imageUrl: string | null };
  onAnswer: (requestId: string, accept: boolean) => void;
  /** Their page — the same one the rail's faces open. */
  onOpenPerson: (userId: string) => void;
  /** Ask to follow somebody who already follows you. */
  onFollowBack: (userId: string) => void;
}) {
  const router = useRouter();
  // Nobody has signed in yet, so this is the first screen of the app. A
  // stranger is owed a hello and a plain sentence about what it does —
  // not a diagram of a follow, which only means something once there is
  // one to wait for.
  if (!signedIn) return <Welcome onSignIn={() => router.push('/sign-in')} />;
  // Somebody to show comes before somebody waiting. A request is already
  // carried by the red count on the Friends tab, which is where it is
  // answered; repeating it here would take the screen away from the people
  // this person already has. It only leads when there is nothing else at all
  // — then it is the one true thing Home can say.
  if (following.length)
    return (
      <Quiet
        people={following}
        onOpenPerson={onOpenPerson}
        onOpenFriends={() => router.push('/people')}
      />
    );
  // Somebody follows you and you have nothing for them yet. That is worth
  // saying out loud — it is the thing that just changed.
  if (followers.length)
    return (
      <HasFollower
        people={followers}
        onOpenPerson={onOpenPerson}
        onFollowBack={onFollowBack}
        onOpenFriends={() => router.push('/people')}
      />
    );
  if (pending) return <PendingFollow {...pending} me={me} onAnswer={onAnswer} />;
  return (
    <GetStarted
      onAddFlight={() => router.push('/add')}
      onFindPeople={() => router.push('/people')}
    />
  );
}

/** Signed in, and Home has nothing to put on itself: no trip of your own and
 * nobody to follow. Both are worth saying, because either one fills it —
 * a traveller wants the first, somebody who came to watch a friend wants the
 * second, and neither should have to guess which this app wants from them.
 *
 * On the navy pass, over a ghost of what Home holds when it is full — the
 * faces of whoever is flying and a live card. Deliberately not the journal's
 * deck of rows: that is the Flights tab's empty screen, and the two sit next
 * to each other, so the same picture on both would read as one screen shown
 * twice. The shapes say what will stand here without inventing a flight. */
function GetStarted({
  onAddFlight,
  onFindPeople,
}: {
  onAddFlight: () => void;
  onFindPeople: () => void;
}) {
  return (
    <PassCard>
      <View style={styles.welcomeTop}>
        <MicroLabel>Nothing in the air</MicroLabel>
        <MiniContrail />
      </View>
      <GhostTravelDay />
      <View style={styles.welcomeCopy}>
        <Text style={styles.welcomeHeadline}>This fills up on flight day.</Text>
        <Text style={styles.welcomePitch}>
          Your own travel day runs here — and so does everyone you follow, the moment they post or
          take off.
        </Text>
      </View>
      <PassDivider />
      {/* Two ways in, drawn the same — the pass's white pill, twice. Either
          one fills this screen and the app has no opinion on which: a
          traveller takes the first, somebody who installed this to watch a
          friend land takes the second. Stacked rather than side by side, so
          neither has to shrink or wrap to fit half a card. */}
      <View style={styles.pair}>
        <PassAction
          label="Add a flight"
          onPress={onAddFlight}
          icon={{ ios: 'plus', android: 'add', web: 'add' }}
        />
        <PassAction
          label="Follow someone"
          onPress={onFindPeople}
          icon={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }}
        />
      </View>
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
function PendingFollow({
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

/** The ordinary day, as the spec draws it: the people you follow in a strip
 * that says plainly that none of them is up, and a quiet card under it.
 *
 * Two pieces rather than one card because they answer different questions —
 * "who am I watching" and "what is happening" — and on the day something IS
 * happening the strip stays put while the card is replaced by the live one. */
function Quiet({
  people,
  onOpenPerson,
  onOpenFriends,
}: {
  people: Person[];
  onOpenPerson: (userId: string) => void;
  onOpenFriends: () => void;
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
          <ThemedText type="small" themeColor="textSecondary" style={styles.stripLine}>
            {/* One friend is a person, not a crowd: "Nobody" over a single
                face reads oddly, so name them. */}
            {people.length === 1
              ? `${people[0].name.split(' ')[0]} isn’t flying right now`
              : 'Nobody is flying right now'}
          </ThemedText>
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

      <PassCard>
        <View style={styles.welcomeTop}>
          <MicroLabel>Quiet skies today</MicroLabel>
          <MiniContrail />
        </View>
        <View style={styles.welcomeCopy}>
          <Text style={styles.welcomeHeadline}>Nothing in the air.</Text>
          <Text style={styles.welcomePitch}>
            The next time you fly — or one of them does — the gate, the delays and the landing run
            here, live.
          </Text>
        </View>
      </PassCard>
    </>
  );
}

/** Somebody follows you, and you follow nobody — so Home has nothing to put
 * on itself however many of them there are. The asymmetry is the thing to
 * say — they can see your days, you cannot see theirs — and saying it about
 * these particular people beats stating the rule at them. With one follower
 * it is also a thing to do, right here. */
function HasFollower({
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

/** The app's own pass, holding its introduction: what it does on the day you
 * fly, then the one thing an account adds. Claims are not mentioned — the
 * intro pages already sell those twice, and the travel day is the headline
 * the product leads on. */
function Welcome({ onSignIn }: { onSignIn: () => void }) {
  return (
    <PassCard>
      <View style={styles.welcomeTop}>
        <MicroLabel>Welcome to FlyRight</MicroLabel>
        <MiniContrail />
      </View>
      <View style={styles.welcomeCopy}>
        <Text style={styles.welcomeHeadline}>Your travel day, live.</Text>
        <Text style={styles.welcomePitch}>
          Gates, delays and boarding as they happen. Sign in and your friends can follow along —
          and you can follow theirs.
        </Text>
      </View>
      <PassDivider />
      <PassAction label="Sign in" onPress={onSignIn} />
    </PassCard>
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
});
