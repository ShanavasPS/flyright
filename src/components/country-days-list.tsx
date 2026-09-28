import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { dayCount } from '@/components/country-days-card';
import { SheenCard } from '@/components/sheen-card';
import { RankRow } from '@/components/stats-cards';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { YearDays } from '@/services/country-days';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "21–25 Aug", "30 Jan – 2 Feb", "4 Jan" from inclusive YYYY-MM-DD days. */
export function daySpan(from: string, to: string): string {
  const d = (day: string) => Number(day.slice(8, 10));
  const m = (day: string) => MONTHS[Number(day.slice(5, 7)) - 1] ?? '';
  if (from === to) return `${d(from)} ${m(from)}`;
  if (from.slice(0, 7) === to.slice(0, 7)) return `${d(from)}–${d(to)} ${m(to)}`;
  return `${d(from)} ${m(from)} – ${d(to)} ${m(to)}`;
}

/** The years to choose between, newest first, as chips. */
export function YearChips({ years, value, onChange }: { years: number[]; value: number; onChange: (year: number) => void }) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {years.map((y) => {
        const on = y === value;
        return (
          <Pressable
            key={y}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            testID={`year-${y}`}
            onPress={() => onChange(y)}
            style={[styles.chip, { borderColor: on ? theme.heading : theme.hairline, backgroundColor: on ? theme.heading : theme.backgroundElement }]}>
            <ThemedText type="smallBold" style={{ color: on ? theme.background : theme.heading }}>{y}</ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Places › Days: every country of the year with its days, the days a
 * missing flight leaves unknown, and how the days are counted. */
export function CountryDaysList({ year }: { year: YearDays }) {
  const router = useRouter();
  const theme = useTheme();
  const most = Math.max(1, ...year.countries.map((c) => c.days));
  return (
    <>
      <SheenCard style={styles.rows}>
        {year.countries.map((c, i) => {
          const last = i === year.countries.length - 1 && !year.notSure.length;
          const sub = [c.cities.slice(0, 3).join(' · '), c.home ? 'your home base' : null].filter(Boolean).join(' · ');
          return (
            <Pressable
              key={c.country}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}, ${dayCount(c.days)}${c.country === 'GB' ? `, ${c.midnights} midnights` : ''}`}
              onPress={() => router.push({ pathname: '/stats/days/[country]', params: { country: c.country, year: String(year.year) } })}>
              <RankRow
                lead={<Text style={styles.flag}>{c.flag || '🏳️'}</Text>}
                value={c.days.toLocaleString()}
                caption={c.days === 1 ? 'day' : 'days'}
                last={last}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {c.name}{' '}
                  <ThemedText type="smallBold" themeColor="textSecondary">{c.country}</ThemedText>
                </ThemedText>
                {!!sub && <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{sub}</ThemedText>}
                {c.country === 'GB' && (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {c.midnights} {c.midnights === 1 ? 'midnight' : 'midnights'}, the UK&apos;s count
                  </ThemedText>
                )}
                <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                  <View style={[styles.fill, { width: `${Math.max(2, (c.days / most) * 100)}%`, backgroundColor: c.home ? theme.heading : theme.tint }]} />
                </View>
              </RankRow>
            </Pressable>
          );
        })}
        {year.notSure.map((span, i) => (
          <RankRow
            key={span.from}
            lead={<View style={[styles.unknown, { backgroundColor: theme.backgroundSelected, borderColor: theme.hairline }]} />}
            value={String(span.days)}
            caption={span.days === 1 ? 'day' : 'days'}
            last={i === year.notSure.length - 1}>
            <ThemedText type="smallBold">Not sure</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {daySpan(span.from, span.to)} · landed in {span.landedIn}, next took off from {span.leftFrom}
            </ThemedText>
            <Pressable accessibilityRole="button" hitSlop={Spacing.two} onPress={() => router.push('/add')} testID="add-missing-flight">
              <ThemedText type="smallBold" themeColor="tint">Add the missing flight</ThemedText>
            </Pressable>
          </RankRow>
        ))}
      </SheenCard>
      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
        A day counts if you were there for any part of it, as tax treaties and the US count; the UK counts midnights. So a
        travel day counts in both countries, and a connection under a day doesn&apos;t count. From your logged flights. Not
        tax advice.
      </ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  chips: { gap: Spacing.two, paddingVertical: Spacing.one },
  chip: { minHeight: 36, paddingHorizontal: Spacing.three, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  rows: { padding: 0, gap: 0, overflow: 'hidden' },
  flag: { fontSize: 26, lineHeight: 32, width: 34, textAlign: 'center' },
  unknown: { width: 34, height: 24, borderRadius: 6, borderWidth: 1 },
  track: { height: 5, borderRadius: 5, overflow: 'hidden', marginTop: Spacing.one },
  fill: { height: 5, borderRadius: 5 },
  note: { paddingHorizontal: Spacing.one, marginTop: Spacing.two },
});
