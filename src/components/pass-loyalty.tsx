import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { passLoyalty, type LoungeTrip } from '@/services/lounge-trip';
import { useMemberships } from '@/services/memberships';

// The boarding-pass screen's own light palette: it is shown to a desk at
// full brightness whatever the phone's theme (screens/boarding-pass).
const INK = '#0B1424';
const INK_SOFT = '#5A6A7E';
const HAIRLINE = '#E3E8EF';
const TINT = '#1E6BE0';
const SUCCESS = '#0FA362';

/** "Also on this pass" under a saved boarding pass (docs/lounges.md,
 * design B4): the membership the booking carries — what the lounge desk
 * and the gate see — whether it is one saved in Memberships, and fast
 * track. A membership not saved yet can be added from here (B5). Nothing
 * when the pass leaves those fields blank. Only the last four digits show. */
export function PassLoyalty({ trip }: { trip: LoungeTrip & { id: string } }) {
  const router = useRouter();
  const { userId } = useAuth();
  const memberships = useMemberships(userId);
  if (!memberships) return null;
  const facts = passLoyalty(trip, memberships);
  if (!facts) return null;
  const name = facts.programme?.name ?? `${facts.airline} frequent flyer`;
  const status = facts.matchId
    ? 'Matches your membership'
    : facts.otherNumberSaved
      ? 'Not the number saved in Memberships'
      : facts.programme
        ? 'Not in Memberships yet'
        : null;

  return (
    <View style={styles.section} testID="pass-loyalty">
      <Text style={styles.label}>ALSO ON THIS PASS</Text>
      <View style={styles.box}>
        <View style={styles.row}>
          <View style={styles.grow}>
            <Text style={styles.title}>
              {name} •••• {facts.last4}
            </Text>
            {status && <Text style={styles.detail}>{status}</Text>}
          </View>
          {facts.matchId ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>On this booking</Text>
            </View>
          ) : facts.programme && !facts.otherNumberSaved ? (
            <Pressable
              testID="pass-loyalty-add"
              accessibilityRole="button"
              accessibilityLabel={`Add ${name} to Memberships`}
              hitSlop={8}
              onPress={() => router.push({ pathname: '/membership', params: { fromJourney: trip.id } })}>
              <Text style={styles.link}>Add</Text>
            </Pressable>
          ) : null}
        </View>
        {facts.fastTrack != null && (
          <View style={[styles.row, styles.divider]}>
            <View style={styles.grow}>
              <Text style={styles.title}>Fast track</Text>
              <Text style={styles.detail}>Marked on the barcode</Text>
            </View>
            <Text style={styles.value}>{facts.fastTrack ? 'Yes' : 'No'}</Text>
          </View>
        )}
      </View>
      <Text style={styles.note}>Read on this phone. The desk sees your status through this number.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two, marginTop: Spacing.four },
  label: { color: INK_SOFT, fontSize: 11, letterSpacing: 1.2, fontWeight: '600' },
  box: { borderWidth: 1, borderColor: HAIRLINE, borderRadius: 20, paddingHorizontal: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 60, paddingVertical: Spacing.two },
  divider: { borderTopWidth: 1, borderTopColor: HAIRLINE },
  grow: { flex: 1, minWidth: 0 },
  title: { color: INK, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  detail: { color: INK_SOFT, fontSize: 13, lineHeight: 18 },
  value: { color: INK, fontSize: 15, fontWeight: '700' },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(15,163,98,0.13)' },
  chipText: { color: SUCCESS, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  link: { color: TINT, fontSize: 15, fontWeight: '600' },
  note: { color: INK_SOFT, fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
