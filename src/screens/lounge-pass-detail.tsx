/** One lounge pass (docs/lounges.md, design B3): the card, the free visits
 * left this membership year, the visits logged with it, and a way to the
 * pass company's own app — which is what the lounge desk scans. */
import { useAuth } from '@clerk/expo';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SectionLabel } from '@/components/grouped-list';
import { LoungePassCard } from '@/components/lounge-pass-card';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayLabelWithYear } from '@/services/dates';
import { membershipYearStart, networkInfo, passYear, runningLow, visitsLeft, visitsLeftLabel, visitsUsed } from '@/services/lounge-pass-logic';
import { priceLabel } from '@/services/lounge-trip';
import { useLoungePass, useLoungeVisits } from '@/services/lounge-passes';
import { unlockMemberships } from '@/services/memberships';

export function LoungePassDetail() {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { userId } = useAuth();
  const pass = useLoungePass(id);
  const visits = useLoungeVisits(userId);
  const [revealed, setRevealed] = useState(false);
  const seen = useRef(false);

  // Removed from its edit screen: nothing left to show here.
  useEffect(() => {
    if (pass) seen.current = true;
    else if (seen.current) router.back();
  }, [pass, router]);

  if (!pass || !visits) return <ThemedView style={styles.container} />;
  const today = new Date().toISOString().slice(0, 10);
  const left = visitsLeft(pass, visits, today);
  const used = visitsUsed(pass, visits, today);
  const start = membershipYearStart(pass.renewsOn, today);
  const mine = visits.filter((v) => v.passId === pass.id && (!start || v.enteredAt.slice(0, 10) >= start));
  const info = networkInfo(pass.network);
  const year = passYear(pass, visits, today);

  const reveal = async () => {
    if (revealed) setRevealed(false);
    else if (await unlockMemberships()) setRevealed(true);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: info?.name ?? 'Lounge pass',
          headerRight: () => (
            <Pressable
              testID="lounge-pass-edit"
              accessibilityRole="button"
              hitSlop={Spacing.two}
              onPress={() => router.push({ pathname: '/lounge-pass-edit', params: { id: pass.id } })}>
              <ThemedText type="link">Edit</ThemedText>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" accessibilityHint={revealed ? 'Hides the number' : 'Shows the number'} onPress={() => void reveal()}>
          <LoungePassCard pass={pass} left={left} number={revealed ? pass.number : undefined} />
        </Pressable>

        {pass.freeVisits != null && (
          <View style={styles.block}>
            <ThemedText type="smallBold" themeColor="heading">
              {left} of {pass.freeVisits} free visits left
            </ThemedText>
            <View style={styles.segments} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {Array.from({ length: Math.min(pass.freeVisits, 30) }, (_, i) => (
                <View
                  key={i}
                  style={[styles.segment, { backgroundColor: i < used ? theme.hairline : runningLow(left) ? theme.warning : theme.tint }]}
                />
              ))}
            </View>
            {pass.renewsOn && (
              <ThemedText type="small" themeColor="textSecondary">
                Renews on {formatDayLabelWithYear(pass.renewsOn)}
              </ThemedText>
            )}
            {runningLow(left) && (
              <View style={[styles.warning, { backgroundColor: `${theme.warning}1F` }]}>
                <SymbolView name={{ ios: 'exclamationmark.circle', android: 'error', web: 'error' }} size={16} tintColor={theme.warning} />
                <ThemedText type="small" style={styles.grow}>
                  {left === 0 ? 'No free visits left' : 'Running low'}
                  {pass.extraVisitCents != null && pass.currency
                    ? `. A visit past the allowance costs ${(pass.extraVisitCents / 100).toFixed(pass.extraVisitCents % 100 ? 2 : 0)} ${pass.currency}.`
                    : '.'}
                </ThemedText>
              </View>
            )}
          </View>
        )}
        {pass.freeVisits == null && (
          <ThemedText type="smallBold" themeColor="heading">
            {visitsLeftLabel(left)}
          </ThemedText>
        )}

        {info && (
          <View style={styles.block}>
            <ThemedText type="small" themeColor="textSecondary">
              {info.desk}
            </ThemedText>
            <PrimaryButton label={`Open ${info.name}`} onPress={() => void Linking.openURL(Platform.OS === 'ios' ? info.ios : info.android)} />
          </View>
        )}

        <SectionLabel>This year</SectionLabel>
        <ThemedView type="backgroundElement" style={styles.list} testID="lounge-pass-year">
          <View style={styles.row}>
            <ThemedText style={styles.grow}>Free visits used</ThemedText>
            <ThemedText style={styles.strong}>{year.free}</ThemedText>
          </View>
          <View style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}>
            <ThemedText style={styles.grow}>Paid visits, after the free ones</ThemedText>
            <ThemedText style={styles.strong}>
              {year.paid}
              {year.paidCents && year.currency ? ` · ${priceLabel({ amount: year.paidCents, currency: year.currency })}` : ''}
            </ThemedText>
          </View>
        </ThemedView>
        <ThemedText type="small" themeColor="textSecondary">
          Counted from what you typed when adding the pass and the visits you log here. Paid and guest visits are billed by the pass company, often weeks later:
          compare with your statement now and then.
        </ThemedText>

        <SectionLabel>Visits this year</SectionLabel>
        {mine.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Visits you log from a trip with “I’m in the lounge” show here.
          </ThemedText>
        ) : (
          <ThemedView type="backgroundElement" style={styles.list}>
            {mine.map((v, i) => (
              <View
                key={v.id}
                style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}>
                <View style={styles.grow}>
                  <ThemedText style={styles.strong} numberOfLines={1}>
                    {v.loungeName}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {v.airport} · {formatDayLabelWithYear(v.enteredAt.slice(0, 10))}
                  </ThemedText>
                </View>
              </View>
            ))}
          </ThemedView>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.four,
  },
  block: { gap: Spacing.two },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 8, borderRadius: 4 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: Spacing.three },
  grow: { flex: 1, minWidth: 0 },
  list: { borderRadius: Spacing.four, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  strong: { fontWeight: '600' },
});
