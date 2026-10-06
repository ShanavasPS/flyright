import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { maskNumber } from '@/services/loyalty-programmes';
import { networkInfo, runningLow } from '@/services/lounge-pass-logic';
import { type LoungePassRow } from '@/services/lounge-passes';

/** One lounge pass as a card, in the airline cards' night navy with the
 * pass's free visits left (docs/lounges.md, design B1). */
export function LoungePassCard({ pass, left, number }: { pass: LoungePassRow; left: number | null; number?: string }) {
  const name = networkInfo(pass.network)?.name ?? 'Lounge pass';
  const low = runningLow(left);
  return (
    <View style={styles.card} accessible accessibilityLabel={`${name}${pass.plan ? `, ${pass.plan}` : ''}. ${badge(pass, left)}`}>
      <View style={styles.top}>
        <View style={styles.stripe} />
        <View style={styles.text}>
          <ThemedText style={styles.eyebrow} numberOfLines={1}>
            LOUNGE PASS
          </ThemedText>
          <ThemedText style={styles.name} numberOfLines={1}>
            {name}
          </ThemedText>
        </View>
        <View style={[styles.badge, low && styles.badgeLow]}>
          <ThemedText style={[styles.badgeText, low && styles.badgeTextLow]}>{badge(pass, left).toUpperCase()}</ThemedText>
        </View>
      </View>
      <View style={styles.bottom}>
        <ThemedText style={styles.number}>{number ?? maskNumber(pass.number)}</ThemedText>
        {pass.plan && (
          <ThemedText style={styles.plan} numberOfLines={1}>
            {pass.plan}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

function badge(pass: LoungePassRow, left: number | null): string {
  if (left == null) return 'Unlimited';
  return pass.freeVisits != null ? `${left} of ${pass.freeVisits} left` : `${left} left`;
}

const styles = StyleSheet.create({
  card: {
    height: 132,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 18,
    paddingVertical: Spacing.three,
    justifyContent: 'space-between',
    backgroundColor: '#14203A',
    experimental_backgroundImage: 'linear-gradient(135deg, #14203A 0%, #22304C 100%)',
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stripe: { width: 5, height: 28, borderRadius: 3, backgroundColor: '#8FB4E6' },
  text: { flex: 1, gap: 1 },
  eyebrow: { fontSize: 10, lineHeight: 13, fontWeight: '600', letterSpacing: 1.5, color: '#B8C3D6' },
  name: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: '#FFFFFF' },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.16)' },
  badgeLow: { backgroundColor: '#F2B441' },
  badgeText: { fontSize: 10, lineHeight: 13, fontWeight: '800', letterSpacing: 1, color: '#FFFFFF' },
  badgeTextLow: { color: '#2B220E' },
  bottom: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two },
  number: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: 1.5, color: '#FFFFFF' },
  plan: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: '500', color: '#B8C3D6' },
});
