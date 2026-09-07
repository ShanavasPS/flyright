import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { DateField } from '@/components/date-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { JourneyRow } from '@/services/journeys';
import { formatKm, type TravelRecap } from '@/services/timeline';
import {
  ALL_TIME,
  journalSpan,
  monthShort,
  monthsWithFlights,
  periodLabel,
  yearsWithFlights,
  type WorldPeriod,
} from '@/services/world-period';

/** Header pill that names the period on the map and opens the chooser.
 * Tinted once anything narrower than "All time" is on. */
export function PeriodButton({
  period,
  onPress,
}: {
  period: WorldPeriod;
  onPress: () => void;
}) {
  const theme = useTheme();
  const active = period.kind !== 'all';
  const colour = active ? theme.tint : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Showing ${periodLabel(period, true)}. Choose a period`}
      onPress={onPress}
      style={[styles.pill, { backgroundColor: theme.backgroundElement }]}>
      <SymbolView
        name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
        size={16}
        weight="semibold"
        tintColor={colour}
      />
      <ThemedText type="smallBold" style={{ color: colour }} numberOfLines={1}>
        {periodLabel(period)}
      </ThemedText>
    </Pressable>
  );
}

/** The chooser, docked where the stats card sits.
 *
 * Years come from the journal, newest first, so there is never an empty year
 * to pick; choosing one unfolds its twelve months with the flightless ones
 * dimmed. "Custom" opens a from/to pair seeded with the whole journal, so the
 * map never goes blank on the way in. The summary line under the title is
 * the recap of what the map is drawing right now, so each tap answers itself. */
export function PeriodCard({
  rows,
  period,
  recap,
  onChange,
  onClose,
}: {
  /** Every journey, before the period narrows it. */
  rows: JourneyRow[];
  period: WorldPeriod;
  /** Recap of the rows the period leaves on the map. */
  recap: TravelRecap;
  onChange: (period: WorldPeriod) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const years = useMemo(() => yearsWithFlights(rows), [rows]);
  const year = period.kind === 'year' || period.kind === 'month' ? period.year : null;
  const months = useMemo(() => (year ? monthsWithFlights(rows, year) : null), [rows, year]);

  const summary =
    recap.trips > 0
      ? [
          `${recap.trips} ${recap.trips === 1 ? 'trip' : 'trips'}`,
          `${recap.airports} ${recap.airports === 1 ? 'airport' : 'airports'}`,
          `${recap.countries} ${recap.countries === 1 ? 'country' : 'countries'}`,
          `${formatKm(recap.totalKm)} km`,
        ].join(' · ')
      : 'No flights in this period';

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.title}>
          <ThemedText themeColor="heading" style={styles.titleText} numberOfLines={1}>
            {periodLabel(period, true)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {summary}
          </ThemedText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          onPress={onClose}
          style={[styles.close, { backgroundColor: theme.field }]}>
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={14}
            weight="bold"
            tintColor={theme.textSecondary}
          />
        </Pressable>
      </View>

      <View style={styles.chips}>
        <Chip label="All time" selected={period.kind === 'all'} onPress={() => onChange(ALL_TIME)} />
        {years.map((y) => (
          <Chip
            key={y}
            label={`${y}`}
            selected={year === y}
            onPress={() => onChange({ kind: 'year', year: y })}
          />
        ))}
        <Chip
          label="Custom"
          selected={period.kind === 'range'}
          onPress={() => {
            if (period.kind === 'range') return;
            const span = journalSpan(rows);
            if (span) onChange({ kind: 'range', ...span });
          }}
        />
      </View>

      {year != null && months && (
        <View style={styles.chips}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const selected = period.kind === 'month' && period.month === m;
            return (
              <Chip
                key={m}
                label={monthShort(m)}
                selected={selected}
                disabled={!months.has(m)}
                onPress={() =>
                  onChange(selected ? { kind: 'year', year } : { kind: 'month', year, month: m })
                }
              />
            );
          })}
        </View>
      )}

      {period.kind === 'range' && (
        <View style={styles.range}>
          <DateField
            label="From"
            value={period.from}
            max={period.to}
            onChange={(from) => onChange({ ...period, from })}
          />
          <DateField
            label="To"
            value={period.to}
            min={period.from}
            onChange={(to) => onChange({ ...period, to })}
          />
        </View>
      )}
    </Card>
  );
}

/** What the footer shows when the chosen period has nothing in it: same
 * footprint as the stats card, with the way back out. Not the onboarding
 * card — this traveller has flights, just none in here. */
export function EmptyPeriodCard({
  period,
  onReset,
}: {
  period: WorldPeriod;
  onReset: () => void;
}) {
  const theme = useTheme();
  return (
    <Card style={styles.emptyCard}>
      <View style={styles.emptyCopy}>
        <ThemedText themeColor="heading" style={styles.emptyTitle} numberOfLines={1}>
          No flights in {periodLabel(period)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          Pick another period, or widen back out.
        </ThemedText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show all time"
        onPress={onReset}
        style={[styles.emptyButton, { backgroundColor: theme.tint }]}>
        <ThemedText type="smallBold" style={styles.emptyButtonLabel}>
          All time
        </ThemedText>
      </Pressable>
    </Card>
  );
}

function Chip({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? theme.tint : theme.field },
        disabled && styles.chipDisabled,
      ]}>
      <ThemedText
        type="smallBold"
        style={{ color: selected ? '#FFFFFF' : theme.text }}
        numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    height: 40,
    maxWidth: 220,
    paddingLeft: Spacing.two + Spacing.half,
    paddingRight: Spacing.three,
    borderRadius: 20,
    shadowColor: '#0B1424',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  card: {
    alignSelf: 'stretch',
    maxWidth: 480,
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  title: {
    flex: 1,
    gap: Spacing.half,
  },
  titleText: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 700,
  },
  close: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    height: 32,
    minWidth: 44,
    paddingHorizontal: Spacing.two + Spacing.half,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipDisabled: {
    opacity: 0.4,
  },
  range: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.three,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    maxWidth: 480,
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  emptyCopy: {
    flex: 1,
    gap: Spacing.half,
  },
  emptyTitle: {
    fontWeight: 700,
  },
  emptyButton: {
    paddingVertical: Spacing.two + Spacing.half,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  emptyButtonLabel: {
    color: '#FFFFFF',
  },
});
