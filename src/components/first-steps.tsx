import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { MicroLabel, PassAction, PassCard, PassDivider } from '@/components/pass-card';
import { PrimaryButton } from '@/components/primary-button';
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
export function FirstSteps({ signedIn, following }: { signedIn: boolean; following: number }) {
  const theme = useTheme();
  const router = useRouter();
  const mine = signedIn;
  // Nobody has signed in yet, so this is the first screen of the app. A
  // stranger is owed a hello and a plain sentence about what it does —
  // not a diagram of a follow, which only means something once you want
  // one. The steps come back the moment there is an account to count.
  if (!signedIn) return <Welcome onSignIn={() => router.push('/sign-in')} />;
  const theirs = following > 0;
  const done = (mine ? 1 : 0) + (theirs ? 1 : 0);

  return (
    <View style={[styles.card, { borderColor: theme.hairline }]}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.meter}>
        {done} OF 2
      </ThemedText>
      <Text style={[styles.headline, { color: theme.heading }]}>A follow has two ends.</Text>

      <View style={styles.link}>
        <End filled={mine} label="You" />
        <View
          style={[
            styles.line,
            { borderColor: done === 2 ? theme.success : theme.hairline },
            done < 2 && styles.dashed,
          ]}
        />
        <End filled={theirs} label="Them" />
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        Make both and you&apos;ll know when they land.
      </ThemedText>

      <PrimaryButton
        label={mine ? 'Find someone to follow' : 'Sign in'}
        onPress={() => router.push(mine ? '/people' : '/sign-in')}
      />

      <ThemedText type="small" themeColor="textSecondary">
        Your own flights go in Flights.
      </ThemedText>
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
  welcomeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  welcomeCopy: { gap: Spacing.two, paddingVertical: Spacing.four },
  welcomeHeadline: { color: WHITE, fontSize: 26, lineHeight: 32, fontWeight: '700' },
  welcomePitch: { color: WHITE_DIM, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  link: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.three },
  end: { alignItems: 'center', gap: Spacing.one },
  ring: { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2 },
  line: { flex: 1, borderTopWidth: 2, marginBottom: Spacing.four },
  dashed: { borderStyle: 'dashed' },
});
