import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { SectionLabel } from '@/components/grouped-list';
import { LoungePassCard } from '@/components/lounge-pass-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { visitsLeft } from '@/services/lounge-pass-logic';
import { useLoungePasses, useLoungeVisits } from '@/services/lounge-passes';
import { billingAvailable, useProLocked } from '@/services/purchases';

/** "Lounge passes" under the airline cards in Memberships (docs/lounges.md,
 * design B1). Tracking a pass is Pro (decision 4): adding one without Pro
 * opens the offer. Passes already saved always show. */
export function LoungePassList() {
  const router = useRouter();
  const theme = useTheme();
  const { userId } = useAuth();
  const passes = useLoungePasses(userId);
  const visits = useLoungeVisits(userId);
  const locked = useProLocked();
  if (!passes || !visits) return null;
  if (passes.length === 0 && locked && !billingAvailable) return null;
  const today = new Date().toISOString().slice(0, 10);

  const add = () => {
    if (locked) router.push({ pathname: '/pro-offer', params: { feature: 'lounge-passes' } });
    else router.push('/lounge-pass-edit');
  };

  return (
    <View style={styles.section}>
      <SectionLabel>Lounge passes</SectionLabel>
      {passes.map((pass) => (
        <Pressable
          key={pass.id}
          testID={`lounge-pass-${pass.network}`}
          accessibilityRole="button"
          accessibilityHint="Opens the pass and its visits"
          onPress={() => router.push({ pathname: '/lounge-pass', params: { id: pass.id } })}
          style={({ pressed }) => pressed && styles.pressed}>
          <LoungePassCard pass={pass} left={visitsLeft(pass, visits, today)} />
        </Pressable>
      ))}
      <Pressable
        testID="add-lounge-pass"
        accessibilityRole="button"
        onPress={add}
        style={({ pressed }) => [styles.add, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }, pressed && styles.pressed]}>
        <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={16} weight="semibold" tintColor={theme.tint} />
        <View style={styles.grow}>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            Add a lounge pass
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Priority Pass, DragonPass and others: free visits left, counted as you use them
          </ThemedText>
        </View>
        {locked && (
          <View style={[styles.pro, { backgroundColor: `${theme.tint}22` }]}>
            <ThemedText type="smallBold" style={[styles.proText, { color: theme.tint }]}>
              Pro
            </ThemedText>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.three },
  pressed: { opacity: 0.7 },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: 1,
  },
  grow: { flex: 1, minWidth: 0 },
  pro: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  proText: { fontSize: 12, lineHeight: 16 },
});
