import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
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
  const theirs = following > 0;
  const done = (mine ? 1 : 0) + (theirs ? 1 : 0);

  return (
    <View style={[styles.card, { borderColor: theme.hairline }]}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.meter}>
        {done} OF 2
      </ThemedText>
      <ThemedText type="subtitle">A follow has two ends.</ThemedText>

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

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(mine ? '/people' : '/sign-in')}
        style={({ pressed }) => [
          styles.action,
          { backgroundColor: theme.tint },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="subtitle" style={{ color: theme.background }}>
          {mine ? 'Find someone to follow' : 'Sign in'}
        </ThemedText>
      </Pressable>

      <ThemedText type="small" themeColor="textSecondary">
        Your own flights go in Flights.
      </ThemedText>
    </View>
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
  link: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.three },
  end: { alignItems: 'center', gap: Spacing.one },
  ring: { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2 },
  line: { flex: 1, borderTopWidth: 2, marginBottom: Spacing.four },
  dashed: { borderStyle: 'dashed' },
  action: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    marginTop: Spacing.one,
  },
  pressed: { opacity: 0.7 },
});
