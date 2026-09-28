import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { YearDays } from '@/services/country-days';

/** Colours for the countries abroad, in order of days; the home country is
 * drawn in the heading navy and "not sure" in a muted grey. */
const ABROAD = ['#38C8D8', '#FF8A65', '#F2B441', '#4E9BF5', '#A78BFA'];
const NOT_SURE = '#A9B8CE';

/** A country as it reads after "in": "the United Kingdom", "Finland". */
export function inCountry(code: string, name: string): string {
  return ['US', 'GB', 'NL', 'PH', 'AE', 'CZ', 'DO', 'BS', 'CF', 'GM', 'KM', 'MV', 'SC'].includes(code) ? `the ${name}` : name;
}

export function dayCount(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? 'day' : 'days'}`;
}

/** One year as a bar: home, the countries abroad, then the days not known. */
export function DaysBar({ year, height = 10 }: { year: YearDays; height?: number }) {
  const theme = useTheme();
  const abroad = year.countries.filter((c) => !c.home);
  const segments = [
    ...year.countries.filter((c) => c.home).map((c) => ({ key: c.country, days: c.days, color: theme.heading })),
    ...abroad.map((c, i) => ({ key: c.country, days: c.days, color: ABROAD[Math.min(i, ABROAD.length - 1)]! })),
    ...(year.notSureDays ? [{ key: 'not-sure', days: year.notSureDays, color: NOT_SURE }] : []),
  ].filter((s) => s.days > 0);
  return (
    <View style={[styles.bar, { height, borderRadius: height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {segments.map((s) => (
        <View key={s.key} style={{ flex: s.days, backgroundColor: s.color }} />
      ))}
    </View>
  );
}

/** Travel stats: this year's days by country, opening Places › Days. The card
 * names itself, like the Home base card above it. */
export function CountryDaysCard({ year, onPress }: { year: YearDays; onPress: () => void }) {
  const theme = useTheme();
  const home = year.countries.find((c) => c.home);
  const abroad = year.countries.filter((c) => !c.home);
  const top = abroad.slice(0, 3);
  const period = year.partial ? `${year.year} so far` : String(year.year);
  const lead = home ? `${dayCount(home.days)} in ${inCountry(home.country, home.name)}` : `${abroad.length} ${abroad.length === 1 ? 'country' : 'countries'}`;
  const rest = [
    home ? `${year.abroadDays.toLocaleString()} abroad` : null,
    year.notSureDays ? `${year.notSureDays} not sure` : null,
  ].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Days by country, ${period}: ${lead}${rest ? `, ${rest}` : ''}. ${top.map((c) => `${c.name} ${dayCount(c.days)}`).join(', ')}`}
      onPress={onPress}
      testID="country-days-card">
      {({ pressed }) => (
        <SheenCard style={[styles.card, pressed && styles.pressed]}>
          <View style={styles.header}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps} numberOfLines={1}>
              Days by country · {period}
            </ThemedText>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              size={13}
              weight="semibold"
              tintColor={theme.textSecondary}
            />
          </View>
          <DaysBar year={year} />
          <View style={styles.summary}>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.grow}>{lead}</ThemedText>
            {!!rest && <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{rest}</ThemedText>}
          </View>
          {top.length > 0 && (
            <View style={styles.top}>
              {top.map((c) => (
                <View key={c.country} style={styles.topItem}>
                  <Text style={styles.flag} accessible={false}>{c.flag || c.country}</Text>
                  <ThemedText type="smallBold" themeColor="heading">{c.days}</ThemedText>
                </View>
              ))}
            </View>
          )}
        </SheenCard>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two, paddingVertical: Spacing.three, paddingHorizontal: Spacing.three },
  pressed: { opacity: 0.8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  caps: { textTransform: 'uppercase', letterSpacing: 1, fontSize: 11, lineHeight: 14, flex: 1 },
  bar: { flexDirection: 'row', gap: 2, overflow: 'hidden' },
  summary: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  grow: { flex: 1, minWidth: 0 },
  top: { flexDirection: 'row', gap: Spacing.three },
  topItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  flag: { fontSize: 18, lineHeight: 22 },
});
