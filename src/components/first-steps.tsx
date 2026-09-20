import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GhostTravelDay } from '@/components/ghost-trips';
import { MicroLabel, PassAction, PassCard, PassDivider } from '@/components/pass-card';
import { ThemedText } from '@/components/themed-text';
import { MiniContrail, WHITE, WHITE_DIM } from '@/components/travel-stats-header';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The two steps Home opens on until both are done: sign in, then follow
 * somebody. Nothing else belongs here — adding a flight lives on Flights,
 * and a delay is not something a person can go and complete.
 *
 * Drawn as one unmade connection rather than a checklist. A two-item list
 * looks trivial; a link with one end missing does the asking by itself, so
 * the words underneath stay few. A follow genuinely needs both ends: the
 * circle is signed-in only (convex/circle.ts requires an identity to invite,
 * accept or be asked), which is what step 1 is for. */
export function FirstSteps({
  signedIn,
  pending,
}: {
  signedIn: boolean;
  /** An invitation waiting on somebody: one you sent, or one sent to you.
   * Null when there is none, which is the ordinary empty Home. */
  pending: { name: string; theirs: boolean } | null;
}) {
  const router = useRouter();
  // Nobody has signed in yet, so this is the first screen of the app. A
  // stranger is owed a hello and a plain sentence about what it does —
  // not a diagram of a follow, which only means something once there is
  // one to wait for.
  if (!signedIn) return <Welcome onSignIn={() => router.push('/sign-in')} />;
  // A follow that has been asked for and not yet answered: one end made,
  // the other still open. That is what the drawing is actually about.
  if (pending) return <PendingFollow name={pending.name} theirs={pending.theirs} />;
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
      {/* Two ways in, drawn the same. Either one fills this screen, and the
          app has no opinion on which: a traveller takes the first, somebody
          who came to watch a friend takes the second, and a filled pill
          beside a text link would tell them they had picked the lesser one. */}
      <View style={styles.pair}>
        <PassChoice label="Add a flight" onPress={onAddFlight} />
        <PassChoice label="Follow someone" onPress={onFindPeople} />
      </View>
    </PassCard>
  );
}

/** A follow has two ends, and one of them is waiting. Shown to whoever is
 * waiting on whom: the person who sent the invitation sees their own end
 * made, the person who received one sees theirs still open. */
function PendingFollow({ name, theirs }: { name: string; theirs: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.card, { borderColor: theme.hairline }]}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.meter}>
        1 OF 2
      </ThemedText>
      <Text style={[styles.headline, { color: theme.heading }]}>
        {theirs ? `${name} invited you.` : `Waiting on ${name}.`}
      </Text>

      <View style={styles.link}>
        <End filled={!theirs} label="You" />
        <View style={[styles.line, { borderColor: theme.hairline }, styles.dashed]} />
        <End filled={theirs} label={name.split(' ')[0]} />
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {theirs
          ? 'Say yes and their travel days show up here.'
          : 'Their travel days show up here once they say yes.'}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/people')}
        style={({ pressed }) => [styles.link_, pressed && styles.pressed]}>
        <ThemedText type="link">{theirs ? 'Open Friends' : 'See who you asked'}</ThemedText>
      </Pressable>
    </View>
  );
}

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

/** One of a pair of equal actions on the navy pass: an outlined pill in the
 * pass's own white, so neither reads as the primary. */
function PassChoice({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
      <Text style={styles.choiceLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {label}
      </Text>
    </Pressable>
  );
}

function End({ filled, label }: { filled: boolean; label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.end}>
      <View
        style={[
          styles.ring,
          { borderColor: filled ? theme.success : theme.hairline },
          !filled && styles.dashed,
          filled && { backgroundColor: `${theme.success}1F` },
        ]}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const RING = 56;

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
  pair: { flexDirection: 'row', gap: Spacing.two },
  choice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(242,246,251,0.32)',
    backgroundColor: 'rgba(242,246,251,0.10)',
  },
  choiceLabel: { color: WHITE, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  secondary: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
  },
  secondaryLabel: { fontSize: 16, lineHeight: 20, fontWeight: '600' },
  link_: { paddingTop: Spacing.one },
  welcomeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  welcomeCopy: { gap: Spacing.two, paddingVertical: Spacing.four },
  welcomeHeadline: { color: WHITE, fontSize: 26, lineHeight: 32, fontWeight: '700' },
  welcomePitch: { color: WHITE_DIM, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  link: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.three },
  end: { alignItems: 'center', gap: Spacing.one },
  ring: { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2 },
  line: { flex: 1, borderTopWidth: 2, marginBottom: Spacing.four },
  dashed: { borderStyle: 'dashed' },
  pressed: { opacity: 0.7 },
});
